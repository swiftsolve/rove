//! `sudo cargo run -p rove-core --example dhcp_watch` — watch passive DHCP
//! capture live.
//!
//! Binding UDP :67 is privileged, so this needs `sudo` on macOS (or root /
//! cap_net_bind_service on Linux). It starts the same background listener the
//! app uses, then prints each device's fingerprint as it broadcasts a DHCP
//! DISCOVER/REQUEST. Reconnect a device's Wi-Fi to force one immediately.
use rove_core::devices::dhcp;
use std::collections::HashSet;
use std::time::Duration;

#[tokio::main]
async fn main() {
    // The first snapshot spawns the listener (attempts the :67 bind).
    let _ = dhcp::snapshot();
    tokio::time::sleep(Duration::from_millis(400)).await;

    match dhcp::status() {
        "active" => println!("DHCP listener: active (bound :67).\n"),
        "unavailable" => {
            eprintln!("DHCP listener: unavailable — could not bind :67.");
            eprintln!("Re-run with elevated privileges, e.g. `sudo cargo run -p rove-core --example dhcp_watch`.");
            return;
        }
        other => println!("DHCP listener: {other}\n"),
    }

    println!("Watching for DHCP broadcasts. Reconnect a device's Wi-Fi to force one. Ctrl-C to stop.\n");
    println!("{:<18} {:<24} {:<16} {:<9} VENDOR CLASS / PRL", "MAC", "HOSTNAME (opt 12)", "OS", "KIND");

    let mut seen: HashSet<String> = HashSet::new();
    loop {
        for (mac, hit) in dhcp::snapshot() {
            if seen.insert(mac.clone()) {
                let detail = hit
                    .vendor_class
                    .clone()
                    .or_else(|| hit.fingerprint.clone())
                    .unwrap_or_else(|| "-".into());
                println!(
                    "{:<18} {:<24} {:<16} {:<9} {}",
                    mac,
                    hit.hostname.as_deref().unwrap_or("-"),
                    hit.os.unwrap_or("-"),
                    hit.kind.unwrap_or("-"),
                    detail,
                );
            }
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}
