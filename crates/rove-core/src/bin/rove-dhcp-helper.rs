//! `rove-dhcp-helper` — the privileged DHCP capture helper.
//!
//! Runs as root (a LaunchDaemon on macOS, where the app itself can't bind the
//! privileged `:67`), listens for DHCP DISCOVER/REQUEST broadcasts, and writes
//! the captured fingerprints to a shared JSON file the unprivileged app reads.
//!
//! Usage: `rove-dhcp-helper [output-path]` — defaults to the platform path the
//! app also reads (see `dhcp::helper_cache_path`). Test it with:
//!   sudo ./target/debug/rove-dhcp-helper /tmp/rove-dhcp.json
use rove_core::devices::dhcp;

#[tokio::main]
async fn main() {
    let path = std::env::args()
        .nth(1)
        .map(std::path::PathBuf::from)
        .unwrap_or_else(dhcp::helper_cache_path);

    eprintln!("rove-dhcp-helper: capturing DHCP fingerprints to {}", path.display());
    match dhcp::run_capture_to_file(&path).await {
        Ok(()) => {}
        Err(e) => {
            eprintln!("rove-dhcp-helper: could not start capture: {e}");
            eprintln!("(binding UDP :67 needs root — run under sudo, or as a LaunchDaemon)");
            std::process::exit(1);
        }
    }
}
