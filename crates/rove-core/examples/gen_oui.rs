//! `cargo run -p rove-core --example gen_oui` — regenerate `data/oui.tsv`
//! from the **IEEE public registry** (the authoritative, always-current source).
//!
//! The lookup table embedded by `oui.rs` is a compilation of factual MAC-prefix
//! assignments published directly by the IEEE Registration Authority at three
//! block sizes:
//!
//! | bits | Registry | CSV |
//! |------|----------|-----|
//! | 24   | MA-L     | <https://standards-oui.ieee.org/oui/oui.csv>   |
//! | 28   | MA-M     | <https://standards-oui.ieee.org/oui28/mam.csv> |
//! | 36   | MA-S     | <https://standards-oui.ieee.org/oui36/oui36.csv> |
//!
//! Each CSV has columns `Registry,Assignment,Organization Name,
//! Organization Address`. We keep only `<bits>\t<hexprefix>\t<vendor>` rows,
//! sorted for stable diffs — the exact shape `oui.rs` parses.
//!
//! Sourcing from IEEE (not Wireshark's GPL-2.0 `manuf` file) keeps the bundled
//! table free of copyleft obligations, which matters for a redistributable
//! binary.
//!
//! Networks that block `standards-oui.ieee.org` (e.g. a locked-down CI/agent
//! egress policy) can pass the three CSVs as local paths instead — the registry
//! of each is read from its own `Registry` column, so order doesn't matter:
//!
//! ```text
//! cargo run -p rove-core --example gen_oui -- oui.csv mam.csv oui36.csv
//! ```

use std::collections::BTreeSet;
use std::path::Path;

const SOURCES: [&str; 3] = [
    "https://standards-oui.ieee.org/oui/oui.csv",
    "https://standards-oui.ieee.org/oui28/mam.csv",
    "https://standards-oui.ieee.org/oui36/oui36.csv",
];

/// IEEE registry name → assignment size in bits.
fn bits_for(registry: &str) -> Option<u8> {
    match registry.trim() {
        "MA-L" => Some(24),
        "MA-M" => Some(28),
        "MA-S" => Some(36),
        _ => None,
    }
}

/// Parse one IEEE CSV blob into `(bits, prefix, vendor)` rows, dropping
/// withheld/blank registrations so a lookup returns `None` rather than a
/// placeholder.
fn rows_from_csv(text: &str, rows: &mut BTreeSet<(u8, String, String)>) {
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(text.as_bytes());
    for record in rdr.records().flatten() {
        // Columns: Registry, Assignment, Organization Name, Organization Address.
        let (Some(registry), Some(assignment), Some(name)) =
            (record.get(0), record.get(1), record.get(2))
        else {
            continue;
        };
        let Some(bits) = bits_for(registry) else { continue };

        let prefix: String = assignment
            .chars()
            .filter(|c| c.is_ascii_hexdigit())
            .collect::<String>()
            .to_uppercase();
        if prefix.len() != (bits / 4) as usize {
            continue;
        }

        // Tab-delimited output, so vendor must be single-line and tab-free.
        let vendor = name.split_whitespace().collect::<Vec<_>>().join(" ");
        if vendor.is_empty()
            || vendor.eq_ignore_ascii_case("private")
            || vendor.chars().all(|c| c.is_ascii_digit())
        {
            continue;
        }

        rows.insert((bits, prefix, vendor));
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut rows: BTreeSet<(u8, String, String)> = BTreeSet::new();

    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()?;
        for url in SOURCES {
            eprintln!("fetching {url}");
            let text = client.get(url).send().await?.error_for_status()?.text().await?;
            rows_from_csv(&text, &mut rows);
        }
    } else {
        for path in &args {
            eprintln!("reading {path}");
            let text = std::fs::read_to_string(path)?;
            rows_from_csv(&text, &mut rows);
        }
    }

    if rows.is_empty() {
        return Err("no rows parsed — check the sources".into());
    }

    let out = Path::new(env!("CARGO_MANIFEST_DIR")).join("data/oui.tsv");
    let body: String = rows
        .iter()
        .map(|(bits, prefix, vendor)| format!("{bits}\t{prefix}\t{vendor}\n"))
        .collect();
    std::fs::write(&out, body)?;

    let (mut n24, mut n28, mut n36) = (0u32, 0u32, 0u32);
    for (bits, ..) in &rows {
        match bits {
            24 => n24 += 1,
            28 => n28 += 1,
            36 => n36 += 1,
            _ => {}
        }
    }
    eprintln!(
        "wrote {} rows to {} (MA-L {n24}, MA-M {n28}, MA-S {n36})",
        rows.len(),
        out.display()
    );
    Ok(())
}
