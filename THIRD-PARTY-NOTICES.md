# Third-Party Notices

Rove bundles the following third-party data. This file seeds the attribution
set; a full audit of all compiled dependencies (Cargo + npm) should be generated
with `cargo about` / `license-checker` before a commercial release.

## IEEE MAC Address Block (OUI) Registry — `crates/rove-core/data/oui.tsv`

The MAC-vendor lookup table is compiled from the IEEE Registration Authority's
public MA-L / MA-M / MA-S assignment registry, a factual database of which
organization owns which MAC prefix.

- Source: IEEE Registration Authority — <https://standards-oui.ieee.org/>
- Regenerated directly from the IEEE CSVs by
  `crates/rove-core/examples/gen_oui.rs` (24-bit MA-L, 28-bit MA-M, and 36-bit
  MA-S blocks).

The table is **not** derived from Wireshark's `manuf` file, so it carries no
GPL obligation.
