//! Linux app icons: the process's `.desktop` entry, then its `Icon=` from the
//! icon theme or `pixmaps`.
use base64::Engine as _;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Icon files bigger than this aren't read. PNGs are scaled down anyway, so
/// this only drops the odd giant SVG with an embedded bitmap.
const MAX_ICON_BYTES: u64 = 1024 * 1024;

/// Edge length a PNG icon is scaled down to, matching the macOS and Windows
/// paths: a few KB per icon over IPC, still crisp in a ~24px box on high DPI.
const ICON_PX: u32 = 64;

/// How long a scan of the `.desktop` files is reused. Long enough that a
/// burst of new apps shares one scan, short enough to see an app installed
/// while Rove runs.
const INDEX_TTL: Duration = Duration::from_secs(300);

/// The icon sizes to try, best first: 128px is crisp in a ~24px box on a
/// high-DPI screen and still small, then the scalable SVG, then whatever
/// else the theme has, nearest first.
const ICON_SIZES: &[&str] = &["128x128", "scalable", "96x96", "256x256", "64x64", "512x512", "48x48", "32x32"];

/// Launchers and interpreters an `Exec=` line can start with. Their name says
/// nothing about the app, so matching on it would give every `python3` or
/// `node` process the icon of whichever app happens to launch through one.
const GENERIC_PROGRAMS: &[&str] = &[
    "sh", "bash", "env", "python", "python3", "java", "node", "electron", "wine", "flatpak", "snap", "gjs", "perl",
    "ruby",
];

/// Directories shared by unrelated programs, where "same folder as the
/// launcher" says nothing about which app a process belongs to.
const SHARED_DIRS: &[&str] = &[
    "/bin",
    "/sbin",
    "/usr/bin",
    "/usr/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/lib",
    "/usr/lib64",
    "/usr/libexec",
    "/usr/lib/x86_64-linux-gnu",
    "/usr/lib/aarch64-linux-gnu",
    "/snap/bin",
    "/app/bin",
];

/// The parts of an application `.desktop` entry the lookup uses.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct DesktopEntry {
    /// The desktop file id, e.g. `com.anthropic.Claude` or `code_code`.
    pub id: String,
    /// `Icon=`: a theme icon name or an absolute path.
    pub icon: String,
    /// The program `Exec=` runs, with `env` and its assignments skipped.
    pub program: Option<String>,
    /// The app id of a `flatpak run` launcher.
    pub flatpak_id: Option<String>,
    pub try_exec: Option<String>,
    pub wm_class: Option<String>,
    pub is_hidden_from_menus: bool,
}

/// What's known about the process to find its entry for.
#[derive(Debug, Default)]
pub(super) struct ProcessFacts {
    /// Lowercased names it goes by: its `comm` and its executable's file name.
    pub names: Vec<String>,
    pub exe: Option<PathBuf>,
    pub flatpak_id: Option<String>,
    /// The `.desktop` id a snap app's entry has, `<snap>_<app>`.
    pub snap_desktop_id: Option<String>,
}

struct Index {
    built: Instant,
    entries: Arc<Vec<DesktopEntry>>,
}

static INDEX: Mutex<Option<Index>> = Mutex::new(None);

/// A `data:` URI for the icon of the app that owns `pid` (preferred), or of
/// a live process named `name` (fallback), from its `.desktop` entry and the
/// icon theme. `None` for processes no installed app claims, such as CLIs
/// and daemons.
pub fn app_icon_data_uri(name: &str, pid: Option<u32>) -> Option<String> {
    let pid = pid.filter(|pid| Path::new(&format!("/proc/{pid}")).exists()).or_else(|| pid_for_name(name));
    let facts = process_facts(name, pid);
    let entries = desktop_entries();
    let entry = best_entry(&entries, &facts)?;
    let path = find_icon(&entry.icon, &icon_dirs())?;
    icon_data_uri(&path)
}

/// The pid of a live process whose `comm` is `name`, for when the process
/// that moved the bytes has exited but a sibling of the same app is running.
fn pid_for_name(name: &str) -> Option<u32> {
    if name.is_empty() {
        return None;
    }
    fs::read_dir("/proc").ok()?.flatten().find_map(|dir| {
        let pid: u32 = dir.file_name().to_str()?.parse().ok()?;
        let comm = fs::read_to_string(dir.path().join("comm")).ok()?;
        (comm.trim_end() == name).then_some(pid)
    })
}

fn process_facts(name: &str, pid: Option<u32>) -> ProcessFacts {
    let mut facts = ProcessFacts::default();
    push_name(&mut facts.names, name);
    let Some(pid) = pid else { return facts };
    let proc_dir = PathBuf::from(format!("/proc/{pid}"));

    facts.exe = fs::read_link(proc_dir.join("exe")).ok();
    if let Some(file_name) = facts.exe.as_deref().and_then(Path::file_name).and_then(|n| n.to_str()) {
        push_name(&mut facts.names, file_name);
    }
    // A Flatpak app's sandbox says which app it is.
    facts.flatpak_id =
        fs::read_to_string(proc_dir.join("root/.flatpak-info")).ok().and_then(|info| flatpak_info_name(&info));
    // A snap app runs in a `snap.<snap>.<app>…` cgroup. Other launchers'
    // `app-…` scopes aren't used: every child inherits them, so a command
    // run from a terminal would get the terminal's icon.
    facts.snap_desktop_id =
        fs::read_to_string(proc_dir.join("cgroup")).ok().and_then(|cgroup| snap_desktop_id(&cgroup));
    facts
}

fn push_name(names: &mut Vec<String>, name: &str) {
    let name = name.trim().to_lowercase();
    if !name.is_empty() && !names.contains(&name) {
        names.push(name);
    }
}

/// The app id in a `.flatpak-info` file: `name=` under `[Application]`.
pub(super) fn flatpak_info_name(info: &str) -> Option<String> {
    let mut is_in_application = false;
    for line in info.lines().map(str::trim) {
        if line.starts_with('[') {
            is_in_application = line == "[Application]";
        } else if is_in_application {
            if let Some(name) = line.strip_prefix("name=") {
                return Some(name.to_string());
            }
        }
    }
    None
}

/// `<snap>_<app>` from a cgroup path such as
/// `0::/user.slice/…/snap.code.code-9287e34f.scope`.
pub(super) fn snap_desktop_id(cgroup: &str) -> Option<String> {
    let unit = cgroup.split('/').find_map(|part| part.strip_prefix("snap."))?;
    let (snap, rest) = unit.split_once('.')?;
    let app = rest.split(['-', '.']).next().filter(|app| !app.is_empty())?;
    Some(format!("{snap}_{app}"))
}

/// The application entries on this machine, read at most every
/// [`INDEX_TTL`]. An id found in an earlier data dir hides the same id in a
/// later one, as the XDG spec has it.
fn desktop_entries() -> Arc<Vec<DesktopEntry>> {
    let mut index = crate::util::net::lock(&INDEX);
    if let Some(index) = index.as_ref().filter(|index| index.built.elapsed() < INDEX_TTL) {
        return Arc::clone(&index.entries);
    }
    let entries = Arc::new(read_desktop_entries(&data_dirs()));
    *index = Some(Index { built: Instant::now(), entries: Arc::clone(&entries) });
    entries
}

pub(super) fn read_desktop_entries(data_dirs: &[PathBuf]) -> Vec<DesktopEntry> {
    let mut seen = HashSet::new();
    let mut entries = Vec::new();
    for dir in data_dirs {
        let Ok(files) = fs::read_dir(dir.join("applications")) else { continue };
        for file in files.flatten() {
            let path = file.path();
            let Some(id) = path.file_name().and_then(|n| n.to_str()).and_then(|n| n.strip_suffix(".desktop")) else {
                continue;
            };
            if !seen.insert(id.to_string()) {
                continue;
            }
            if let Some(entry) = fs::read_to_string(&path).ok().and_then(|text| parse_desktop_entry(id, &text)) {
                entries.push(entry);
            }
        }
    }
    entries
}

/// `$XDG_DATA_HOME` then `$XDG_DATA_DIRS`, plus the Flatpak and snap export
/// dirs in case the session's `XDG_DATA_DIRS` left them out.
fn data_dirs() -> Vec<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut dirs: Vec<PathBuf> = Vec::new();
    match std::env::var_os("XDG_DATA_HOME").filter(|v| !v.is_empty()) {
        Some(data_home) => dirs.push(data_home.into()),
        None => dirs.extend(home.as_ref().map(|home| home.join(".local/share"))),
    }
    let data_dirs = std::env::var("XDG_DATA_DIRS")
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "/usr/local/share:/usr/share".into());
    dirs.extend(data_dirs.split(':').filter(|d| !d.is_empty()).map(PathBuf::from));
    dirs.extend(home.map(|home| home.join(".local/share/flatpak/exports/share")));
    dirs.push("/var/lib/flatpak/exports/share".into());
    dirs.push("/var/lib/snapd/desktop".into());

    let mut seen = HashSet::new();
    dirs.retain(|dir| seen.insert(dir.components().collect::<PathBuf>()));
    dirs
}

/// Parse the `[Desktop Entry]` group of a `.desktop` file. `None` for
/// anything that isn't a visible application with an icon.
pub(super) fn parse_desktop_entry(id: &str, text: &str) -> Option<DesktopEntry> {
    let mut is_in_entry = false;
    let (mut icon, mut exec, mut try_exec, mut wm_class) = (None, None, None, None);
    let (mut is_application, mut is_hidden, mut is_no_display) = (false, false, false);
    for line in text.lines().map(str::trim) {
        if line.starts_with('[') {
            is_in_entry = line == "[Desktop Entry]";
            continue;
        }
        if !is_in_entry {
            continue;
        }
        // Localised keys (`Icon[de]=`) don't match these exact names.
        let Some((key, value)) = line.split_once('=') else { continue };
        let value = value.trim().to_string();
        match key.trim() {
            "Type" => is_application = value == "Application",
            "Icon" => icon = Some(value),
            "Exec" => exec = Some(value),
            "TryExec" => try_exec = Some(value),
            "StartupWMClass" => wm_class = Some(value),
            "Hidden" => is_hidden = value == "true",
            "NoDisplay" => is_no_display = value == "true",
            _ => {}
        }
    }
    let icon = icon.filter(|icon| !icon.is_empty())?;
    if !is_application || is_hidden {
        return None;
    }
    let (program, flatpak_id) = exec.as_deref().map(parse_exec).unwrap_or_default();
    Some(DesktopEntry {
        id: id.to_string(),
        icon,
        program,
        flatpak_id,
        try_exec,
        wm_class,
        is_hidden_from_menus: is_no_display,
    })
}

/// The program an `Exec=` line runs, and the app id when it's a
/// `flatpak run`. Skips a leading `env VAR=value …`; field codes (`%U`) and
/// quoting are irrelevant to the first word.
pub(super) fn parse_exec(exec: &str) -> (Option<String>, Option<String>) {
    let mut words = exec.split_whitespace().map(|word| word.trim_matches('"'));
    let mut program = words.next();
    if program.is_some_and(|p| base_name(p) == "env") {
        program = words.by_ref().find(|word| !word.contains('=') && !word.starts_with('-'));
    }
    let program = program.map(str::to_string);
    let flatpak_id = if program.as_deref().is_some_and(|p| base_name(p) == "flatpak") {
        let mut rest = words.skip_while(|word| *word != "run").skip(1);
        rest.find(|word| !word.starts_with('-')).map(str::to_string)
    } else {
        None
    };
    (program, flatpak_id)
}

fn base_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// The entry that best claims this process, or `None` when none does.
pub(super) fn best_entry<'a>(entries: &'a [DesktopEntry], facts: &ProcessFacts) -> Option<&'a DesktopEntry> {
    entries
        .iter()
        .filter_map(|entry| match_rank(entry, facts).map(|rank| (rank, entry)))
        // Lowest rank wins; then an entry shown in menus over a hidden helper
        // (such as a URL handler) for the same app.
        .min_by_key(|(rank, entry)| (*rank, entry.is_hidden_from_menus))
        .map(|(_, entry)| entry)
}

/// How surely `entry` is this process's app: 0 is certain, higher is a
/// looser match, `None` is no match.
fn match_rank(entry: &DesktopEntry, facts: &ProcessFacts) -> Option<u8> {
    let id = entry.id.to_lowercase();
    // The sandbox names the app outright.
    if facts.flatpak_id.as_deref().is_some_and(|app| app.eq_ignore_ascii_case(&entry.id))
        || facts.snap_desktop_id.as_deref().is_some_and(|snap| snap.eq_ignore_ascii_case(&entry.id))
    {
        return Some(0);
    }
    // A Flatpak process only ever belongs to its own app's entry.
    if facts.flatpak_id.is_some() {
        return None;
    }

    let program = entry.program.as_deref().filter(|p| !GENERIC_PROGRAMS.contains(&base_name(p)));
    let launcher = program.and_then(resolve_program);
    if let (Some(exe), Some(launcher)) = (facts.exe.as_deref(), launcher.as_deref()) {
        // The launcher is the executable (`/usr/bin/foo` → the same file).
        if launcher == exe {
            return Some(1);
        }
        // The launcher is a wrapper beside it (`/opt/google/chrome/google-chrome`
        // starting `/opt/google/chrome/chrome`).
        if let (Some(dir), Some(launcher_dir)) = (exe.parent(), launcher.parent()) {
            if dir == launcher_dir && !SHARED_DIRS.iter().any(|shared| dir == Path::new(shared)) {
                return Some(2);
            }
        }
    }

    let keys: Vec<String> = [program, entry.try_exec.as_deref()]
        .into_iter()
        .flatten()
        .filter(|p| !GENERIC_PROGRAMS.contains(&base_name(p)))
        .map(|p| base_name(p).to_lowercase())
        .chain(entry.wm_class.iter().map(|class| class.to_lowercase()))
        .chain([id.clone()])
        .collect();
    if facts.names.iter().any(|name| keys.contains(name)) {
        return Some(3);
    }
    // Reverse-DNS ids name the app last: `org.gnome.Nautilus` ↔ `nautilus`.
    let id_tail = id.rsplit('.').next().unwrap_or(&id);
    facts.names.iter().any(|name| name == id_tail).then_some(4)
}

/// The file a launcher command runs, following symlinks, so it compares
/// against `/proc/<pid>/exe` (which is always resolved).
fn resolve_program(program: &str) -> Option<PathBuf> {
    let path = if program.contains('/') {
        PathBuf::from(program)
    } else {
        let search = std::env::var("PATH").unwrap_or_default();
        let found = search
            .split(':')
            .chain(["/usr/local/bin", "/usr/bin", "/bin"])
            .map(|dir| Path::new(dir).join(program))
            .find(|candidate| candidate.is_file());
        found?
    };
    fs::canonicalize(path).ok()
}

/// Where icon themes and pixmaps live, in lookup order.
fn icon_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = data_dirs().into_iter().map(|dir| dir.join("icons")).collect();
    dirs.extend(std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".icons")));
    dirs
}

/// The file for an `Icon=` value: an absolute path as is, otherwise the
/// name in the `hicolor` theme (where apps install their icons) at the best
/// size it has, then in `pixmaps`.
pub(super) fn find_icon(icon: &str, icon_dirs: &[PathBuf]) -> Option<PathBuf> {
    let icon_path = Path::new(icon);
    if icon_path.is_absolute() {
        return icon_path.is_file().then(|| icon_path.to_path_buf());
    }
    // Some entries name the file rather than the icon.
    let name = icon.strip_suffix(".png").or_else(|| icon.strip_suffix(".svg")).unwrap_or(icon);
    for size in ICON_SIZES {
        for dir in icon_dirs {
            let apps = dir.join("hicolor").join(size).join("apps");
            for extension in ["png", "svg"] {
                let candidate = apps.join(format!("{name}.{extension}"));
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    icon_dirs.iter().filter_map(|dir| dir.parent()).map(|share| share.join("pixmaps")).find_map(|pixmaps| {
        ["png", "svg"].iter().map(|extension| pixmaps.join(format!("{name}.{extension}"))).find(|p| p.is_file())
    })
}

/// The icon file as a `data:` URI. A PNG is scaled down to [`ICON_PX`] when
/// it's bigger (snap icons are often 512px and a few hundred KB); an SVG
/// goes as it is. Other formats (XPM) and oversized files are skipped.
fn icon_data_uri(path: &Path) -> Option<String> {
    let extension = path.extension().and_then(|e| e.to_str())?;
    if !matches!(extension, "png" | "svg") || fs::metadata(path).ok()?.len() > MAX_ICON_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    if extension == "svg" {
        return Some(data_uri("image/svg+xml", &bytes));
    }
    let (rgba, w, h) = decode_png(&bytes)?;
    if w <= ICON_PX && h <= ICON_PX {
        return Some(data_uri("image/png", &bytes));
    }
    let (small, sw, sh) = downscale(&rgba, w, h, ICON_PX);
    encode_png(&small, sw, sh).map(|png| data_uri("image/png", &png))
}

fn data_uri(mime: &str, bytes: &[u8]) -> String {
    format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Decode a PNG of any colour type to 8-bit straight-alpha RGBA.
fn decode_png(bytes: &[u8]) -> Option<(Vec<u8>, u32, u32)> {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().ok()?;
    let mut buf = vec![0; reader.output_buffer_size()?];
    let frame = reader.next_frame(&mut buf).ok()?;
    let pixels = &buf[..frame.buffer_size()];
    let rgba = match frame.color_type {
        png::ColorType::Rgba => pixels.to_vec(),
        png::ColorType::Rgb => pixels.chunks_exact(3).flat_map(|p| [p[0], p[1], p[2], 255]).collect(),
        png::ColorType::GrayscaleAlpha => pixels.chunks_exact(2).flat_map(|p| [p[0], p[0], p[0], p[1]]).collect(),
        png::ColorType::Grayscale => pixels.iter().flat_map(|&g| [g, g, g, 255]).collect(),
        png::ColorType::Indexed => return None,
    };
    Some((rgba, frame.width, frame.height))
}

/// Shrink an RGBA image so its longer side is `side`, averaging each target
/// pixel's source area. Colours are weighted by alpha so transparent pixels
/// don't darken the edges.
pub(super) fn downscale(rgba: &[u8], w: u32, h: u32, side: u32) -> (Vec<u8>, u32, u32) {
    let scale = side as f64 / w.max(h) as f64;
    let (tw, th) = (((w as f64 * scale).round() as u32).max(1), ((h as f64 * scale).round() as u32).max(1));
    let mut out = Vec::with_capacity((tw * th * 4) as usize);
    for ty in 0..th {
        let (y0, y1) = (ty * h / th, ((ty + 1) * h / th).max(ty * h / th + 1));
        for tx in 0..tw {
            let (x0, x1) = (tx * w / tw, ((tx + 1) * w / tw).max(tx * w / tw + 1));
            let mut sum = [0u64; 4];
            for y in y0..y1 {
                for x in x0..x1 {
                    let i = ((y * w + x) * 4) as usize;
                    let alpha = rgba[i + 3] as u64;
                    for channel in 0..3 {
                        sum[channel] += rgba[i + channel] as u64 * alpha;
                    }
                    sum[3] += alpha;
                }
            }
            let count = ((y1 - y0) * (x1 - x0)) as u64;
            let alpha = sum[3];
            for channel in sum.iter().take(3) {
                out.push(channel.checked_div(alpha).unwrap_or(0) as u8);
            }
            out.push((alpha / count) as u8);
        }
    }
    (out, tw, th)
}

fn encode_png(rgba: &[u8], w: u32, h: u32) -> Option<Vec<u8>> {
    let mut png_bytes = Vec::new();
    let mut encoder = png::Encoder::new(&mut png_bytes, w, h);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.write_header().ok()?.write_image_data(rgba).ok()?;
    Some(png_bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    /// A fresh, empty directory under the system temp dir for one test.
    fn temp_dir(test: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("rove-app-icon-{test}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create the test dir");
        dir
    }

    fn facts(names: &[&str]) -> ProcessFacts {
        ProcessFacts { names: names.iter().map(|n| n.to_string()).collect(), ..Default::default() }
    }

    fn entry(id: &str, text: &str) -> DesktopEntry {
        parse_desktop_entry(id, text).expect("a visible application entry")
    }

    #[test]
    fn parses_the_desktop_entry_group_only() {
        let parsed = entry(
            "com.anthropic.Claude",
            "[Desktop Entry]\nType=Application\nName=Claude\nExec=claude-desktop %U\nIcon=claude-desktop\nIcon[de]=other\nStartupWMClass=com.anthropic.Claude\n\n[Desktop Action new-window]\nExec=elsewhere\nIcon=elsewhere\n",
        );
        assert_eq!(parsed.icon, "claude-desktop");
        assert_eq!(parsed.program.as_deref(), Some("claude-desktop"));
        assert_eq!(parsed.wm_class.as_deref(), Some("com.anthropic.Claude"));
        assert!(!parsed.is_hidden_from_menus);
    }

    #[test]
    fn skips_hidden_iconless_and_non_application_entries() {
        assert!(parse_desktop_entry("a", "[Desktop Entry]\nType=Application\nExec=a\nIcon=a\nHidden=true").is_none());
        assert!(parse_desktop_entry("b", "[Desktop Entry]\nType=Application\nExec=b").is_none());
        assert!(parse_desktop_entry("c", "[Desktop Entry]\nType=Link\nURL=x\nIcon=c").is_none());
        // NoDisplay entries stay: a URL handler can still be the only match.
        assert!(entry("d", "[Desktop Entry]\nType=Application\nExec=d\nIcon=d\nNoDisplay=true").is_hidden_from_menus);
    }

    #[test]
    fn reads_the_program_behind_env_and_the_flatpak_app_id() {
        assert_eq!(parse_exec("env FOO=1 BAR=2 /opt/app/run --flag %U"), (Some("/opt/app/run".into()), None));
        assert_eq!(
            parse_exec("/usr/bin/flatpak run --branch=stable --arch=x86_64 --command=obs com.obsproject.Studio"),
            (Some("/usr/bin/flatpak".into()), Some("com.obsproject.Studio".into()))
        );
    }

    #[test]
    fn reads_the_sandboxed_app_from_flatpak_info_and_snap_cgroups() {
        assert_eq!(
            flatpak_info_name("[Application]\nname=com.obsproject.Studio\nruntime=x\n\n[Instance]\nname=other")
                .as_deref(),
            Some("com.obsproject.Studio")
        );
        assert_eq!(
            snap_desktop_id(
                "0::/user.slice/user-1000.slice/user@1000.service/app.slice/snap.code.code-9287e34f.scope\n"
            )
            .as_deref(),
            Some("code_code")
        );
        assert_eq!(snap_desktop_id("0::/user.slice/app-gnome-org.gnome.Terminal-1.scope"), None);
    }

    #[test]
    fn matches_a_process_by_program_wm_class_or_id() {
        let entries = vec![
            entry("org.gnome.Nautilus", "[Desktop Entry]\nType=Application\nExec=nautilus --new-window\nIcon=nautilus"),
            entry("spotify", "[Desktop Entry]\nType=Application\nExec=/usr/bin/run-spotify\nIcon=spotify-client\nStartupWMClass=Spotify"),
            entry("com.anthropic.Claude", "[Desktop Entry]\nType=Application\nExec=claude-desktop %U\nIcon=claude-desktop"),
        ];
        let icon = |names: &[&str]| best_entry(&entries, &facts(names)).map(|e| e.icon.as_str());
        assert_eq!(icon(&["nautilus"]), Some("nautilus"));
        assert_eq!(icon(&["spotify"]), Some("spotify-client"));
        assert_eq!(icon(&["claude-desktop"]), Some("claude-desktop"));
        assert_eq!(icon(&["curl"]), None);
    }

    #[test]
    fn prefers_the_menu_entry_over_a_hidden_helper() {
        let entries = vec![
            entry(
                "code-url-handler",
                "[Desktop Entry]\nType=Application\nExec=code --open-url %U\nIcon=handler\nNoDisplay=true",
            ),
            entry("code", "[Desktop Entry]\nType=Application\nExec=code %F\nIcon=vscode"),
        ];
        assert_eq!(best_entry(&entries, &facts(&["code"])).map(|e| e.icon.as_str()), Some("vscode"));
    }

    #[test]
    fn ignores_generic_launchers_and_keeps_flatpaks_to_their_own_entry() {
        let entries = vec![
            entry("some-electron-app", "[Desktop Entry]\nType=Application\nExec=node /opt/app/main.js\nIcon=app"),
            entry("com.obsproject.Studio", "[Desktop Entry]\nType=Application\nExec=/usr/bin/flatpak run com.obsproject.Studio\nIcon=com.obsproject.Studio\nStartupWMClass=obs"),
            entry("obs-native", "[Desktop Entry]\nType=Application\nExec=obs\nIcon=wrong"),
        ];
        assert!(best_entry(&entries, &facts(&["node"])).is_none(), "node isn't the Electron app");
        let obs = ProcessFacts { flatpak_id: Some("com.obsproject.Studio".into()), ..facts(&["obs"]) };
        assert_eq!(best_entry(&entries, &obs).map(|e| e.icon.as_str()), Some("com.obsproject.Studio"));
    }

    #[test]
    fn matches_a_snap_app_by_its_cgroup() {
        let entries = vec![entry(
            "chromium_chromium",
            "[Desktop Entry]\nType=Application\nExec=/snap/bin/chromium %U\nIcon=/snap/chromium/current/chromium.png",
        )];
        let chrome = ProcessFacts { snap_desktop_id: Some("chromium_chromium".into()), ..facts(&["chrome"]) };
        assert!(best_entry(&entries, &chrome).is_some());
        assert!(best_entry(&entries, &facts(&["chrome"])).is_none());
    }

    #[test]
    fn matches_an_executable_beside_its_launcher_script() {
        let dir = temp_dir("launcher");
        let app_dir = dir.join("opt/browser");
        fs::create_dir_all(&app_dir).unwrap();
        fs::write(app_dir.join("browser-launcher"), "#!/bin/sh").unwrap();
        fs::write(app_dir.join("engine"), "").unwrap();
        let exec =
            format!("[Desktop Entry]\nType=Application\nExec={}/browser-launcher\nIcon=browser", app_dir.display());
        let entries = vec![entry("browser", &exec)];
        let engine =
            ProcessFacts { exe: Some(fs::canonicalize(app_dir.join("engine")).unwrap()), ..facts(&["engine"]) };
        assert_eq!(best_entry(&entries, &engine).map(|e| e.icon.as_str()), Some("browser"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reads_entries_with_earlier_data_dirs_winning() {
        let dir = temp_dir("entries");
        let (home, system) = (dir.join("home"), dir.join("system"));
        for (root, icon) in [(&home, "mine"), (&system, "theirs")] {
            fs::create_dir_all(root.join("applications")).unwrap();
            fs::write(
                root.join("applications/app.desktop"),
                format!("[Desktop Entry]\nType=Application\nExec=app\nIcon={icon}"),
            )
            .unwrap();
        }
        let entries = read_desktop_entries(&[home, system]);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].icon, "mine");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn downscales_by_averaging_without_darkening_transparent_edges() {
        // 4x2: a red half and a fully transparent half, scaled to 2x1.
        let mut rgba = Vec::new();
        for _ in 0..2 {
            rgba.extend([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
        }
        let (out, w, h) = downscale(&rgba, 4, 2, 2);
        assert_eq!((w, h), (2, 1));
        assert_eq!(out, vec![255, 0, 0, 255, 0, 0, 0, 0]);
        // A half-covered pixel keeps its colour at half alpha, not a darker red.
        let (out, _, _) = downscale(&[255, 0, 0, 255, 0, 0, 0, 0], 2, 1, 1);
        assert_eq!(out, vec![255, 0, 0, 127]);
    }

    #[test]
    fn finds_the_best_sized_theme_icon_then_pixmaps() {
        let dir = temp_dir("icons");
        let icons = dir.join("share/icons");
        for size in ["48x48", "128x128"] {
            fs::create_dir_all(icons.join(format!("hicolor/{size}/apps"))).unwrap();
            fs::write(icons.join(format!("hicolor/{size}/apps/app.png")), "png").unwrap();
        }
        fs::create_dir_all(icons.join("hicolor/scalable/apps")).unwrap();
        fs::write(icons.join("hicolor/scalable/apps/vector.svg"), "<svg/>").unwrap();
        fs::create_dir_all(dir.join("share/pixmaps")).unwrap();
        fs::write(dir.join("share/pixmaps/old.png"), "png").unwrap();

        let dirs = [icons.clone()];
        assert_eq!(find_icon("app", &dirs), Some(icons.join("hicolor/128x128/apps/app.png")));
        assert_eq!(find_icon("app.png", &dirs), Some(icons.join("hicolor/128x128/apps/app.png")));
        assert_eq!(find_icon("vector", &dirs), Some(icons.join("hicolor/scalable/apps/vector.svg")));
        assert_eq!(find_icon("old", &dirs), Some(dir.join("share/pixmaps/old.png")));
        assert_eq!(find_icon("missing", &dirs), None);
        let absolute = icons.join("hicolor/48x48/apps/app.png");
        assert_eq!(find_icon(absolute.to_str().unwrap(), &dirs), Some(absolute));
        fs::remove_dir_all(dir).unwrap();
    }
}
