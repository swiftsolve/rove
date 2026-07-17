//! `cargo run -p rove-core --example gen_hosting_asns` — refresh
//! `data/hosting-asns.txt`, the set of datacenter / hosting / VPN autonomous
//! systems the ISP card uses to tell a VPN exit from a real consumer ISP.
//!
//! A residential connection's public IP is on an *access* network (Bell,
//! Comcast, …); a VPN or proxy puts it on a *hosting* network (AWS, OVH, M247,
//! …). So membership in this list, tested against the ASN [`crate::geoip`]
//! already resolves for our public IP, is the signal: in the list ⇒ we're behind
//! a VPN/proxy, and the card says so rather than naming the datacenter as an ISP.
//!
//! Source: **brianhama/bad-asn-list** (MIT), a maintained CSV of hosting/
//! datacenter/VPN ASNs assembled for exactly this kind of "is this a real user or
//! a datacenter?" check. We keep only the numbers — the org name is already in
//! our own ASN table — and write them sorted, one per line, so the checked-in
//! file diffs cleanly month to month.
//!
//! <https://raw.githubusercontent.com/brianhama/bad-asn-list/master/bad-asn-list.csv>
//!
//! This catches VPNs that egress through a datacenter, which is essentially all
//! commercial ones and any personal cloud VPN. A VPN routed out through a
//! residential ISP's own ASN is invisible to any ASN-based check — detecting
//! those needs a paid anonymizer database, out of scope for an offline tool.

use std::collections::BTreeSet;
use std::path::Path;

const SOURCE: &str =
    "https://raw.githubusercontent.com/brianhama/bad-asn-list/master/bad-asn-list.csv";

/// Pull the leading integer out of a CSV row like `16509,"Amazon.com, Inc."`.
/// Returns None for the header row and anything malformed, so both are skipped.
fn parse_asn(line: &str) -> Option<u32> {
    line.split(',').next()?.trim().parse::<u32>().ok()
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dest = Path::new(env!("CARGO_MANIFEST_DIR")).join("data/hosting-asns.txt");

    let csv = match std::env::args().nth(1) {
        Some(path) => std::fs::read_to_string(&path)?,
        None => {
            eprintln!("fetching {SOURCE}");
            let body = reqwest::Client::builder()
                .build()?
                .get(SOURCE)
                .send()
                .await?
                .error_for_status()?
                .text()
                .await?;
            body
        }
    };

    // BTreeSet: dedup and sort in one pass, so the output is stable and the file
    // embeds as an already-sorted slice for binary search with no runtime sort.
    let asns: BTreeSet<u32> = csv.lines().filter_map(parse_asn).collect();

    // Guard against committing a truncated download or an error page as a
    // "refresh": the real list is ~700 entries and must contain the anchors the
    // geoip tests assert on (AWS, M247), or on-device VPN detection would go dark.
    if asns.len() < 500 {
        return Err(format!(
            "refusing to write {}: parsed only {} ASNs — expected ~700, likely a bad download",
            dest.display(),
            asns.len()
        )
        .into());
    }
    for anchor in [16509u32, 9009] {
        if !asns.contains(&anchor) {
            return Err(format!("refusing to write {}: missing anchor AS{anchor}", dest.display()).into());
        }
    }

    let mut out = String::new();
    out.push_str("# Datacenter / hosting / VPN autonomous systems — one ASN per line, sorted.\n");
    out.push_str("# Source: brianhama/bad-asn-list (MIT). Refresh:\n");
    out.push_str("#   cargo run -p rove-core --example gen_hosting_asns\n");
    out.push_str("# Used by geoip::is_hosting_asn to flag a VPN/proxy exit on the ISP card.\n");
    for asn in &asns {
        out.push_str(&asn.to_string());
        out.push('\n');
    }

    std::fs::write(&dest, &out)?;
    eprintln!("wrote {} ({} ASNs)", dest.display(), asns.len());
    eprintln!("brianhama/bad-asn-list is MIT — keep the README attribution intact.");
    Ok(())
}
