# How Rove Captures Network Data (per OS)

Rove shows you the same facts on every platform — your Wi-Fi signal, the LAN
devices, your gateway, DNS, link speed, live throughput — but **no operating
system exposes these through a single API**. Each OS has its own tools, output
formats, and quirks. This page documents *how* Rove actually gets each piece of
data on Linux, Windows, and macOS, and the design patterns that keep it sane.

All the code lives in `crates/rove-core/`. The OS-specific probes were recently
consolidated into one place: `crates/rove-core/src/platform/`, one file per OS.

---

## 1. The core strategy: shell out, then parse

Rove's central technique is **shelling out to the OS's own networking tools and
parsing their text output.** It does *not* re-implement `ip`/`netsh`/`ifconfig`;
it runs them and reads what they print. Two reasons:

- Those tools already have privileged, correct, battle-tested access to the
  kernel's network state. Reimplementing them (raw netlink sockets, WMI COM
  calls, `getifaddrs`) would be far more code and far more fragile.
- It mirrors how the original Electron version of Rove worked, so behaviour
  stays consistent.

The one exception is **byte counters** (data usage + live throughput), which come
from the cross-platform [`sysinfo`](https://docs.rs/sysinfo) crate instead of
shelling out — more on that in §7.

### The command runner

Every shell-out goes through `crates/rove-core/src/shell.rs`:

```rust
pub async fn try_run(command: &str) -> Option<String> {
    try_run_timeout(command, Duration::from_secs(15)).await
}
```

Three things to notice, each a deliberate design choice:

- **It returns `Option<String>`, never an error.** A missing tool, a non-zero
  exit, a timeout, or empty output all collapse to `None`. The comment says it:
  *"callers treat missing tools as 'no data'."* This is what makes the fallback
  chains in §3 possible — a failed probe just returns `None` and the caller tries
  the next option.
- **It's `async` with a timeout** (`tokio::time::timeout`, `shell.rs:54`). A hung
  `nmcli` can't freeze the app; after 15s it's abandoned.
- **It picks the right shell per OS** (`shell.rs:25`): `cmd /C` on Windows, `sh -c`
  everywhere else. On Windows there's a separate `try_run_powershell` because most
  Windows probes are PowerShell, not `cmd`.

There's also a Windows-only detail: `hide_window` sets the `CREATE_NO_WINDOW`
flag (`0x0800_0000`) so spawning `powershell`/`netsh` doesn't flash a black
console window on screen (`shell.rs:6-16`). No-op on Unix.

---

## 2. The safety layer (shell injection)

Because Rove builds shell command strings that sometimes contain values from
the network (interface names, neighbor IPs), it has to guard against injection.
Two gatekeepers in `crates/rove-core/src/net_util.rs`:

- **`is_shell_safe_ip`** (`net_util.rs:44`) — an address is safe to interpolate
  *only if it parses as a real `IpAddr`*, because a parsed address can only
  contain `[0-9a-fA-F:.]` — never a `;`, `|`, `$`, or backtick. Guards the
  `ping`/`getent` call sites that take an IP straight from the ARP table.
- **`is_shell_safe_iface`** (`net_util.rs:51`) — interface names are bounded to
  ≤40 chars of a safe alphabet. It deliberately *allows spaces* (Windows really
  has interfaces named `"Ethernet 2"` and `"Local Area Connection"`) but rejects
  every genuine metacharacter.

And **`sanitize_display`** (`net_util.rs:65`) strips control characters and
Unicode bidi overrides from names that come off the network (mDNS TXT records,
reverse DNS) before they're stored or rendered — so a malicious neighbour can't
inject terminal escape sequences or right-to-left overrides into your device
list.

---

## 3. Dispatch and fallback chains

The cross-platform *contract* (which probe to call, in what order) lives in the
feature modules; the OS-specific probes live in `platform/`. `network_info.rs`
shows the dispatch pattern. Two flavours:

**Runtime dispatch with `cfg!`** — a boolean checked at runtime, so all branches
compile on every OS:

```rust
pub async fn default_gateway() -> Option<String> {
    if cfg!(target_os = "windows") {
        return platform::windows::default_gateway().await;
    }
    // Linux: ip route ...   then fall through to  macOS: route -n get default
    if let Some(out) = try_run("ip route show default ... | awk '{print $3; exit}'").await {
        ...
    }
    let out = try_run("route -n get default ... | grep gateway ...").await?;
    ...
}
```

Notice the **fallback chain**: try `ip route` (Linux), and if that returns `None`
(iproute2 not installed, or we're on macOS), fall through to `route -n get`
(the BSD/macOS tool). One function, two platforms, graceful degradation.

**Compile-time dispatch with `match` on `std::env::consts::OS`** —
`connection_details` (`network_info.rs:56`) routes to a different probe per
(OS, connection-type) pair:

```rust
match (std::env::consts::OS, connection_type) {
    ("linux",   "wifi") => platform::linux::wifi_details(iface).await,
    ("linux",   _)      => platform::linux::ethernet_details(iface).await,
    ("macos",   "wifi") => platform::macos::wifi_details().await,
    ("windows", "wifi") => platform::windows::wifi_details().await,
    ("windows", _)      => platform::windows::ethernet_details(iface).await,
    _ => ConnectionDetails::default(),
}
```

The ultimate fallback for the interface list is `generic_interface_list()`
(`platform/mod.rs:61`), which uses the cross-platform `sysinfo` crate — used when
a native probe fails *and* as the whole implementation on any OS without a
dedicated path.

---

## 4. What gets captured, tool by tool

Here's the master map. Each row is one fact the UI shows; the columns are the
actual command run on each OS.

| Data | Linux | Windows | macOS |
|------|-------|---------|-------|
| **Default gateway** | `ip route show default` | `Find-NetRoute -RemoteIPAddress 8.8.8.8` → `.NextHop` | `route -n get default` |
| **Default interface** | `ip route show default` (`dev` field) | `Find-NetRoute` → `.InterfaceAlias` | `route -n get default` |
| **DNS servers** | `/etc/resolv.conf` (`nameserver` lines) | `Get-DnsClientServerAddress` | `/etc/resolv.conf` |
| **Interface list** | `ip -j addr` (JSON) + `/sys/class/net/*/speed` | `Get-NetAdapter` + `Get-NetIPAddress` | `sysinfo` + `ifconfig -a` states |
| **Wi‑Fi details** | `nmcli`, then `iw dev link`/`info`, then `iwgetid` | `netsh wlan show interfaces` | CoreWLAN (in-process) + `system_profiler` |
| **Ethernet details** | `ethtool`, then `/sys/.../speed`, then `nmcli` | `Get-NetAdapter` (LinkSpeed/Duplex) | — |
| **Link speed** | `/sys/class/net/<if>/speed` | `Get-NetAdapter.LinkSpeed` | CoreWLAN transmit rate (Wi-Fi) |
| **Subnet / CIDR** | `ip -j addr show <if>` | `Get-NetIPAddress` | (subnet module) |
| **Neighbor/ARP table** | `ip neigh show` (has state) | `arp -a` | `arp -a` |
| **Byte counters** | `/sys/class/net/*/statistics` + `sysinfo` | `sysinfo` | `sysinfo` |
| **Timezone offset** | `date +%z` | `(Get-TimeZone).BaseUtcOffset` | `date +%z` |
| **Ping** | `ping -c N -i 0.2 -W 1` | `ping -n N -w <ms>` | `ping -c N -i 0.2 -W 1` |
| **Public IP** | `https://api.ipify.org` (reqwest) | same | same |

The rest of this section walks the interesting ones.

### Routing: gateway & default interface

The **Windows** approach is subtle and worth calling out (`platform/windows.rs:16`).
The naive way — list all `0.0.0.0/0` routes and pick the lowest metric — is
*wrong*, because an unplugged Ethernet adapter can leave a stale metric-0 default
route behind, so you'd report a dead link while actually on Wi-Fi. Rove instead
asks `Find-NetRoute -RemoteIPAddress 8.8.8.8`, which returns the route Windows
would *actually* use to reach the internet — only over a live interface.

Linux and macOS read the routing table directly (`ip route` / `route -n get`).

### Interface list

- **Linux** (`platform/linux.rs:32`): `ip -j addr` gives JSON, parsed with serde.
  Link speed comes from reading the file `/sys/class/net/<name>/speed` directly —
  no command needed, `/sys` is a virtual filesystem the kernel exposes.
- **Windows** (`platform/windows.rs:48`): one PowerShell one-liner enumerates
  every adapter and emits pipe-delimited rows (`Name|Status|LinkSpeed|Mac|Virtual|IPv4`).
  There's real domain logic here: it drops all-zero-MAC filter miniports (Npcap,
  WFP), and hides *virtual* adapters (Hyper-V switches, VPN tunnels) unless
  they're actually carrying an IP or serving as the default route — so idle WAN
  miniports and Bluetooth PAN don't clutter the list.
- **macOS**: uses the generic `sysinfo` list, enriched with per-interface up/down
  state parsed from `ifconfig -a` (`platform/macos.rs:27`).

### Wi‑Fi details — the messiest per-OS divergence

Each OS reports Wi-Fi completely differently, and Rove normalizes them all into
one `ConnectionDetails` struct:

- **Linux** (`platform/linux.rs:103`) layers *three* tools because no single one
  is complete: `nmcli` (SSID, signal %, frequency, channel, security), then
  `iw dev link`/`info` (signal in dBm, tx bitrate, channel), then `iwgetid` as a
  last-ditch SSID source. Each fills only the gaps the previous left (`d.frequency
  = d.frequency.or(...)`).
- **Windows** (`platform/windows.rs:120`): parses `netsh wlan show interfaces`.
  This has a genuinely tricky bug baked into the fix — Wi-Fi 6E/7 access points
  print a "Colocated APs" block whose `Channel:`/`Band:` values appear *before*
  the real connection's, so a naive first-match grabs the wrong channel. The
  parser keys off whole-line `Key : Value` labels to avoid it (there's a unit test
  for exactly this at `windows.rs:298`). netsh doesn't report centre frequency, so
  Rove derives it from band + channel using the 802.11 channel plan
  (`channel_to_frequency`, `windows.rs:166`).
- **macOS** (`platform/macos.rs:12`, `platform/mac_native.rs`): Apple gutted the
  private `airport -I` tool on macOS 14.4+ (it prints only a deprecation notice)
  and every shell tool now returns `<redacted>` for the SSID. So Rove reads Wi-Fi
  *in-process* via **CoreWLAN**: the SSID (gated behind Location Services, which
  Rove requests once at startup through CoreLocation) and the transmit rate —
  CoreWLAN is the only remaining source of Wi-Fi link speed. `system_profiler`
  fills in RSSI/channel/security (cached off the hot path since it takes seconds),
  with `airport`/`networksetup` kept only as legacy fallbacks.

A shared post-step, `finalize_wifi` (`platform/mod.rs:50`), converts a dBm RSSI
into a 0–100% bar whenever the OS only gave dBm — so the signal meter looks the
same everywhere.

---

## 5. LAN device discovery (the ARP table trick)

> This is a summary. For the full pipeline — TCP/mDNS probing, OUI vendor lookup,
> reverse-DNS batching, and the weighted-vote device classifier — see the
> dedicated page: [How Rove Discovers & Identifies LAN Devices](./device-discovery.md).

The device scanner (`crates/rove-core/src/devices/mod.rs`) is a small pipeline,
and it's a nice piece of network engineering. The **ground truth for "who's on my
LAN" is the kernel's neighbor table** (the ARP cache on IPv4) — the map of IP →
MAC the kernel has already resolved. Rove reads it via `ip neigh show` on Linux
(which includes a reachability state) or `arp -a` elsewhere (`platform/mod.rs:122`).

But the ARP cache only holds hosts the machine has *recently talked to* — idle
devices won't be there. So before reading it, Rove **actively wakes every host
in the subnet** (`devices/sweep.rs`):

```rust
// ping every address in the /24..30, 64 at a time
futures_util::stream::iter(hosts)
    .map(|ip| async move {
        let cmd = crate::platform::ping_command(&ip, 1, 700);
        let _ = crate::shell::try_run_timeout(&cmd, Duration::from_secs(3)).await;
    })
    .buffer_unordered(CONCURRENT_PROBES)   // 64 concurrent
    .collect::<Vec<()>>()
    .await;
```

The clever part (comment at `sweep.rs:1`): **we don't care whether the ping
succeeds.** The point is that sending *any* packet forces the kernel to do an ARP
exchange to find the target's MAC — which populates the neighbor table *even for
hosts that silently drop the ping*. The ping is bait; the ARP entry is the catch.
A TCP port probe runs alongside to reach ICMP-filtering hosts, plus two passive
listeners — **mDNS** and **SSDP/UPnP** — that catch devices announcing their own
friendly names and models.

Everything then gets enriched: vendor from the MAC's OUI prefix; hostname from
whichever source is friendliest (mDNS → SSDP → NetBIOS → reverse DNS); a hardware
model from mDNS/SSDP; and a device `kind` from a 13-way weighted-vote classifier
that also folds in HTTP-banner hints. The local machine is added manually because
it never appears in its own neighbor table (`add_self_if_missing`,
`devices/mod.rs:174`). The full pipeline — SSDP, HTTP banners, NetBIOS, and the
classifier — is covered in the [device-discovery page](./device-discovery.md).

---

## 6. Byte counters: data usage & live throughput

These two are the exception to "shell out" — they read kernel byte counters via
the `sysinfo` crate, which is cross-platform, so there's very little per-OS code.

- **Live throughput** (`crates/rove-core/src/live_throughput.rs`): a stateful
  1 Hz sampler. `sysinfo`'s `received()`/`transmitted()` return the *delta* since
  the last refresh, so throughput is `bytes * 8 / 1e6 / elapsed_secs` = Mbps,
  then exponentially smoothed (`SMOOTH_ALPHA = 0.35`) so the chart isn't jagged.
  It sums only physical interfaces (skipping `veth`/`docker`/`tun`/… via
  `is_virtual_interface`).
- **Data usage** (`crates/rove-core/src/data_usage.rs`): accumulates those
  deltas into daily buckets. It uses `saturating_sub` on the counters so a counter
  *reset* (reboot, driver reload) credits zero rather than dumping a phantom
  multi-GB spike.

The one per-OS wrinkle is the "since-boot total": on **Linux**, Rove prefers
reading `/sys/class/net/*/statistics/{rx,tx}_bytes` directly
(`platform/linux.rs:220`, `boot_totals`) because `/sys` is authoritative; on
Windows/macOS it falls back to summing `sysinfo`'s totals.

---

## 7. Diagnostics & ping

`crates/rove-core/src/diagnostics.rs` measures gateway health by pinging it 10
times and parsing the RTT out of each reply line with a regex
(`time=12.3 ms`). From those samples it computes average latency, **jitter**
(mean absolute difference between consecutive RTTs), and **packet loss**
(replies received vs. probes sent). The `ping` flags differ per OS — Windows uses
`-n <count> -w <ms>`, Unix uses `-c <count> -i 0.2 -W 1` — abstracted behind
`ping_command` (`platform/mod.rs:154`).

---

## 8. The design in one picture

```
         ┌──────────────────────────────────────────────┐
         │  feature modules (OS-agnostic contract)        │
         │  network_info · interfaces · devices ·         │
         │  diagnostics · data_usage                      │
         │      │  "give me the gateway / wifi / subnet"  │
         └──────┼───────────────────────────────────────┘
                │ dispatch via cfg!(target_os) / match OS
      ┌─────────┼─────────────┬────────────────┐
      ▼         ▼             ▼                ▼
 platform::  platform::   platform::      generic_interface_list()
  linux       windows      macos          + sysinfo   ← ultimate
   ip/iw/     PowerShell/   ifconfig/                    fallback
   ethtool    netsh         CoreWLAN
      │         │             │
      ▼         ▼             ▼
   shell::try_run  /  try_run_powershell   ← one runner, timeout,
      │                                       windowless, Option<String>
      ▼
   OS networking tools  →  text/JSON  →  parsed into shared types.rs structs
                                          (camelCase, Serialize → IPC → UI)
```

**The whole philosophy:** define the facts once as OS-agnostic functions, dispatch
to per-OS probes that shell out to each platform's native tools, treat every probe
as fallible (`Option`), chain fallbacks, and normalize everything into the shared
`types.rs` structs that serialize across the IPC bridge to the UI. Adding support
for a new OS means adding one file under `platform/` and a `match` arm — the
feature modules and the UI don't change.
