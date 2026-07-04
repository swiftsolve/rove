//! `cargo run -p beacon-core --example scan` — prints a live LAN scan.
#[tokio::main]
async fn main() {
    let scan = beacon_core::devices::scan().await;
    println!("subnet {:?} via {:?} — {} devices", scan.subnet, scan.interface_name, scan.devices.len());
    for d in &scan.devices {
        println!(
            "{:<15} {:<18} {:<10} {}",
            d.ip,
            d.hostname.as_deref().unwrap_or("-"),
            d.kind,
            if d.reachable { "online" } else { "cached" }
        );
    }
}
