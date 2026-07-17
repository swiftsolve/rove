//! `cargo run -p rove-core --example gen_geoip` — refresh
//! `data/dbip-country-lite.mmdb.gz` from **DB-IP's** monthly Lite release.
//!
//! The table embedded by `geoip.rs` is DB-IP's free IP-to-Country Lite database
//! in MMDB format, downloaded verbatim:
//!
//! <https://download.db-ip.com/free/dbip-country-lite-YYYY-MM.mmdb.gz>
//!
//! DB-IP cuts a release at the start of each month and keeps the previous ones
//! up, so this walks back from the current month until one exists — a fresh
//! month's file may not be posted on the 1st.
//!
//! Unlike `gen_oui`, nothing is transformed: the download *is* the artifact, and
//! the checked-in file is byte-for-byte upstream's. It stays gzip'd in the repo
//! because MMDB is an opaque binary either way, so there's no plaintext source
//! of truth to keep alongside it, and `geoip.rs` embeds this file directly.
//!
//! Licensed CC BY 4.0 — attribution is required and lives in the README. Chosen
//! over MaxMind's GeoLite2, which needs an account and a license key, and whose
//! EULA obliges you to destroy superseded copies within 30 days of each
//! twice-weekly release — impossible for a binary already on users' machines.
//!
//! Networks that block `download.db-ip.com` can pass a pre-downloaded `.mmdb.gz`
//! as a local path instead:
//!
//! ```text
//! cargo run -p rove-core --example gen_geoip -- dbip-country-lite-2026-07.mmdb.gz
//! ```

use std::io::Read;
use std::path::Path;

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
fn validate(gz: &[u8]) -> Result<String, String> {
    let mut raw = Vec::new();
    flate2::read::GzDecoder::new(gz)
        .read_to_end(&mut raw)
        .map_err(|e| format!("not valid gzip ({e}) — probably an error page, not the database"))?;

    let reader = maxminddb::Reader::from_source(raw)
        .map_err(|e| format!("gzip is valid but the contents aren't a readable MMDB: {e}"))?;

    let kind = &reader.metadata().database_type;
    if !kind.contains("Country") {
        return Err(format!("expected an IP-to-Country database, got {kind:?}"));
    }
    // A country database that can't place 8.8.8.8 is not one worth shipping.
    let sample = reader
        .lookup("8.8.8.8".parse().unwrap())
        .map_err(|e| format!("sample lookup failed: {e}"))?
        .decode::<maxminddb::geoip2::Country>()
        .map_err(|e| format!("sample decode failed: {e}"))?
        .and_then(|c| c.country.iso_code.map(str::to_string));
    if sample.as_deref() != Some("US") {
        return Err(format!("sample lookup of 8.8.8.8 gave {sample:?}, expected US"));
    }

    Ok(kind.clone())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dest = Path::new(env!("CARGO_MANIFEST_DIR")).join("data/dbip-country-lite.mmdb.gz");

    let (gz, from) = match std::env::args().nth(1) {
        Some(path) => (std::fs::read(&path)?, path),
        None => {
            let client = reqwest::Client::builder().build()?;
            let (year, month) = current_year_month();
            // This month, else the last few — early in a month the new file may
            // not be posted yet, and we'd rather ship last month's than nothing.
            let mut found = None;
            for back in 0..3 {
                let (y, m) = months_back(year, month, back);
                let url =
                    format!("https://download.db-ip.com/free/dbip-country-lite-{y}-{m:02}.mmdb.gz");
                eprintln!("trying {url}");
                let response = client.get(&url).send().await?;
                if response.status().is_success() {
                    found = Some((response.bytes().await?.to_vec(), url));
                    break;
                }
                eprintln!("  → HTTP {} (not published yet?)", response.status());
            }
            found.ok_or("no DB-IP Lite release found for the last 3 months")?
        }
    };

    match validate(&gz) {
        Ok(kind) => eprintln!("validated {kind:?}, {} bytes gzip'd", gz.len()),
        Err(why) => return Err(format!("refusing to write {}: {why}", dest.display()).into()),
    }

    std::fs::write(&dest, &gz)?;
    eprintln!("wrote {} from {from}", dest.display());
    eprintln!("DB-IP Lite is CC BY 4.0 — keep the README attribution intact.");
    Ok(())
}
