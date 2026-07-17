//! `cargo run -p rove-core --example gen_geoip` — refresh the bundled **DB-IP**
//! Lite databases that `geoip.rs` embeds, from their monthly free releases.
//!
//! Two tables are bundled, downloaded verbatim (MMDB format):
//!
//!   * `data/dbip-country-lite.mmdb.gz` — IP → country
//!   * `data/dbip-asn-lite.mmdb.gz` — IP → autonomous system (number + operator)
//!
//! <https://download.db-ip.com/free/dbip-{country,asn}-lite-YYYY-MM.mmdb.gz>
//!
//! DB-IP cuts a release at the start of each month and keeps the previous ones
//! up, so this walks back from the current month until one exists — a fresh
//! month's file may not be posted on the 1st.
//!
//! Nothing is transformed: the download *is* the artifact, and the checked-in
//! files are byte-for-byte upstream's. They stay gzip'd in the repo because MMDB
//! is an opaque binary either way, so there's no plaintext source of truth to
//! keep alongside them, and `geoip.rs` embeds these files directly.
//!
//! Licensed CC BY 4.0 — attribution is required and lives in the README. Chosen
//! over MaxMind's GeoLite2, which needs an account and a license key, and whose
//! EULA obliges you to destroy superseded copies within 30 days of each
//! twice-weekly release — impossible for a binary already on users' machines.
//!
//! Usage:
//!
//! ```text
//! cargo run -p rove-core --example gen_geoip              # refresh both tables
//! cargo run -p rove-core --example gen_geoip -- asn       # just one table
//! ```
//!
//! Networks that block `download.db-ip.com` can pass a pre-downloaded `.mmdb.gz`
//! as a second argument, alongside the table it is:
//!
//! ```text
//! cargo run -p rove-core --example gen_geoip -- country dbip-country-lite-2026-07.mmdb.gz
//! ```

use std::io::Read;
use std::path::Path;

/// One bundled database: how to fetch it, where it lands, and how to prove a
/// download is really that table before it overwrites the checked-in copy.
struct Db {
    /// DB-IP URL slug and the CLI selector, e.g. "country" or "asn".
    slug: &'static str,
    /// Destination path, relative to the crate root.
    dest: &'static str,
    /// Substring the MMDB's `database_type` must contain — the coarse guard that
    /// we downloaded the right *kind* of table, not just a valid MMDB.
    type_marker: &'static str,
    /// A sample lookup that must succeed on a known-good address, so a truncated
    /// or wrong-but-plausible file is caught here rather than at first use.
    sample: fn(&maxminddb::Reader<Vec<u8>>) -> Result<(), String>,
}

const DATABASES: &[Db] = &[
    Db {
        slug: "country",
        dest: "data/dbip-country-lite.mmdb.gz",
        type_marker: "Country",
        // A country database that can't place 8.8.8.8 as US is not worth shipping.
        sample: |reader| {
            let got = reader
                .lookup("8.8.8.8".parse().unwrap())
                .map_err(|e| format!("sample lookup failed: {e}"))?
                .decode::<maxminddb::geoip2::Country>()
                .map_err(|e| format!("sample decode failed: {e}"))?
                .and_then(|c| c.country.iso_code.map(str::to_string));
            (got.as_deref() == Some("US"))
                .then_some(())
                .ok_or_else(|| format!("sample lookup of 8.8.8.8 gave {got:?}, expected US"))
        },
    },
    Db {
        slug: "asn",
        dest: "data/dbip-asn-lite.mmdb.gz",
        type_marker: "ASN",
        // Google's block is AS15169; a table that doesn't say so is the wrong one.
        sample: |reader| {
            let got = reader
                .lookup("8.8.8.8".parse().unwrap())
                .map_err(|e| format!("sample lookup failed: {e}"))?
                .decode::<maxminddb::geoip2::Asn>()
                .map_err(|e| format!("sample decode failed: {e}"))?
                .and_then(|a| a.autonomous_system_number);
            (got == Some(15169))
                .then_some(())
                .ok_or_else(|| format!("sample lookup of 8.8.8.8 gave AS{got:?}, expected AS15169"))
        },
    },
];

/// (year, month) for the current UTC month, from the system clock. Avoids a
/// `chrono`/`time` dependency for what is one civil-date calculation in a dev
/// tool: days since the Unix epoch, converted via the standard days-from-civil
/// inverse (Howard Hinnant's algorithm).
fn current_year_month() -> (i32, u32) {
    let days = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock is before the Unix epoch")
        .as_secs() as i64
        / 86_400;

    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y } as i32, m as u32)
}

/// The month `back` months before (year, month).
fn months_back(year: i32, month: u32, back: u32) -> (i32, u32) {
    let total = year as i64 * 12 + (month as i64 - 1) - back as i64;
    (total.div_euclid(12) as i32, total.rem_euclid(12) as u32 + 1)
}

/// Reject anything that isn't the database we expect before it lands in the
/// repo: a 404 body, an HTML error page, or a truncated download would all
/// otherwise be committed as a "refresh" and fail at compile time or, worse,
/// at the first lookup.
fn validate(db: &Db, gz: &[u8]) -> Result<String, String> {
    let mut raw = Vec::new();
    flate2::read::GzDecoder::new(gz)
        .read_to_end(&mut raw)
        .map_err(|e| format!("not valid gzip ({e}) — probably an error page, not the database"))?;

    let reader = maxminddb::Reader::from_source(raw)
        .map_err(|e| format!("gzip is valid but the contents aren't a readable MMDB: {e}"))?;

    let kind = reader.metadata().database_type.clone();
    if !kind.contains(db.type_marker) {
        return Err(format!(
            "expected a {} database (type contains {:?}), got {kind:?}",
            db.slug, db.type_marker
        ));
    }
    (db.sample)(&reader)?;
    Ok(kind)
}

/// Download `db`'s latest monthly release (walking back a few months if the
/// newest isn't posted yet), or read it from `local` when given, then validate
/// and write it into place.
async fn refresh(
    client: &reqwest::Client,
    db: &Db,
    local: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
    let dest = Path::new(env!("CARGO_MANIFEST_DIR")).join(db.dest);

    let (gz, from) = match local {
        Some(path) => (std::fs::read(path)?, path.to_string()),
        None => {
            let (year, month) = current_year_month();
            // This month, else the last few — early in a month the new file may
            // not be posted yet, and we'd rather ship last month's than nothing.
            let mut found = None;
            for back in 0..3 {
                let (y, m) = months_back(year, month, back);
                let url = format!(
                    "https://download.db-ip.com/free/dbip-{}-lite-{y}-{m:02}.mmdb.gz",
                    db.slug
                );
                eprintln!("trying {url}");
                let response = client.get(&url).send().await?;
                if response.status().is_success() {
                    found = Some((response.bytes().await?.to_vec(), url));
                    break;
                }
                eprintln!("  → HTTP {} (not published yet?)", response.status());
            }
            found.ok_or_else(|| {
                format!("no DB-IP {} Lite release found for the last 3 months", db.slug)
            })?
        }
    };

    match validate(db, &gz) {
        Ok(kind) => eprintln!("validated {kind:?}, {} bytes gzip'd", gz.len()),
        Err(why) => return Err(format!("refusing to write {}: {why}", dest.display()).into()),
    }

    std::fs::write(&dest, &gz)?;
    eprintln!("wrote {} from {from}", dest.display());
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // `[<slug>] [<local-path>]` — no args refreshes every bundled table; a slug
    // narrows to one; a second arg feeds it a pre-downloaded file.
    let slug = std::env::args().nth(1);
    let local = std::env::args().nth(2);

    let selected: Vec<&Db> = match slug.as_deref() {
        None => DATABASES.iter().collect(),
        Some(s) => {
            let db = DATABASES
                .iter()
                .find(|d| d.slug == s)
                .ok_or_else(|| format!("unknown table {s:?} — expected one of country, asn"))?;
            vec![db]
        }
    };
    if local.is_some() && selected.len() != 1 {
        return Err("a local file path only makes sense with a single table selected".into());
    }

    let client = reqwest::Client::builder().build()?;
    for db in selected {
        refresh(&client, db, local.as_deref()).await?;
    }

    eprintln!("DB-IP Lite is CC BY 4.0 — keep the README attribution intact.");
    Ok(())
}
