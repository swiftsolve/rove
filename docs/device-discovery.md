# How Beacon Discovers & Identifies LAN Devices

The Devices screen answers a deceptively hard question: **"what's on my network,
and what is each thing?"** — without admin rights, without installing a driver,
and in a couple of seconds. This page walks the whole pipeline, from an empty
subnet to a labelled list of "Living-Room-AppleTV / tv" entries, using the real
code in `crates/beacon-core/src/devices/` and its helpers (`mdns.rs`, `oui.rs`).

It doubles as a Rust lesson: this subsystem shows off async concurrency, the
`HashMap` entry API, weighted scoring over fixed arrays, `spawn_blocking`, and
compile-time-embedded data — all in service of one feature.

---

## The core problem

There is no OS API that just *returns* your LAN devices. What exists is the
kernel's **neighbor table** (a.k.a. the ARP cache on IPv4): a map of `IP → MAC`
for hosts the machine has *recently communicated with*. That's the closest thing
to ground truth — if an IP↔MAC pair is in there, that device provably exists and
responded at the link layer.

Two problems with using it directly:

1. **It's sparse.** It only holds hosts you've talked to lately. A phone or smart
   plug sitting quietly won't be in it.
2. **It's bare.** An IP and a MAC tell you nothing about *what* the device is.

So Beacon's job is: (a) **populate** the neighbor table by provoking traffic to
every host, then (b) **read** it, then (c) **enrich** each bare entry into an
identified device. That's the pipeline.

---

## The pipeline at a glance

From `scan()` in `crates/beacon-core/src/devices/mod.rs:25`:

```
1. Scope     → find my subnet (e.g. 192.168.1.0/24)
2. Provoke   → wake every host so it enters the neighbor table
   (ICMP sweep ‖ TCP probe ‖ mDNS listen — all concurrent, ~3.2s)
3. Read      → the neighbor table = ground-truth list of who exists
4. Enrich    → per host: vendor (OUI) + hostname (rDNS/mDNS) + kind (classify)
5. Assemble  → add this machine, sort gateway→self→by-IP, dedupe by MAC
```

Steps 2's three probes and the reverse-DNS batch are all `async` and run
concurrently — the whole scan is bounded by a single `DISCOVERY_WINDOW` of 3.2
seconds (`mod.rs:23`), not the sum of its parts. That concurrency is the reason
it feels instant.

---

## Stage 1 — Scoping the subnet

You can't sweep "the network" until you know its address range. `subnet_of`
(`devices/subnet.rs:7`) gets the interface's IPv4 + prefix length from the
platform probe (`ip -j addr` on Linux, `Get-NetIPAddress` on Windows, `sysinfo`
fallback) and turns it into a CIDR like `192.168.1.0/24`.

The arithmetic is pure bit-twiddling on the 32-bit integer form of an IPv4
address (`subnet.rs:29-58`):

```rust
fn to_cidr(ip: Ipv4Addr, prefix: u32) -> String {
    let network = Ipv4Addr::from(u32::from(ip) & prefix_mask(prefix));
    format!("{network}/{prefix}")
}

pub fn prefix_mask(prefix: u32) -> u32 {
    if prefix == 0 { 0 } else { u32::MAX << (32 - prefix.min(32)) }
}
```

`prefix_mask(24)` is `0xFFFFFF00`; ANDing an IP with it zeroes the host bits,
leaving the network address. `contains()` uses the same mask to test membership,
which is how the scan later filters the neighbor table to *just this subnet*
(so a stale entry from a previous network doesn't leak in).

> **Rust note:** `u32::from(ipv4)` and `Ipv4Addr::from(u32)` are free,
> lossless conversions — an IPv4 address *is* a `u32`. Beacon leans on this for
> all subnet math and for `ip_sort_key` (sorting devices numerically by address).

---

## Stage 2 — Provoking hosts (the ARP-table trick)

This is the clever core. To get a silent host into the neighbor table, you have
to make your kernel send it a packet — *any* packet — because to send one, the
kernel must first ARP-resolve the target's MAC, which creates the neighbor
entry. **You don't care if the host answers.** The ARP resolution already
happened; the entry is already cached. Beacon does this two complementary ways,
plus a passive listener, all at once (`mod.rs:35-45`).

### 2a. ICMP sweep — `devices/sweep.rs`

Ping every address in the subnet, 64 at a time:

```rust
futures_util::stream::iter(hosts)
    .map(|ip| async move {
        let cmd = crate::platform::ping_command(&ip, 1, 700);
        let _ = crate::shell::try_run_timeout(&cmd, Duration::from_secs(3)).await;
    })
    .buffer_unordered(CONCURRENT_PROBES)   // 64
    .collect::<Vec<()>>()
    .await;
```

The `let _ =` says it loud: **the ping result is discarded.** The ping is bait.
It only runs on `/24`–`/30` subnets (`sweep.rs:14`) — sweeping a `/16` would be
65k pings, which is antisocial, and anything smaller than `/30` is pointless.

### 2b. TCP `connect()` probe — `devices/probe.rs`

An ICMP sweep misses hosts that *drop ping* — increasingly the default on phones
and hardened IoT. So Beacon also tries to open a TCP connection to a short list
of tell-tale ports on every host:

```rust
const PROBE_PORTS: &[u16] = &[
    80, 443, 22, 9100, 631, 554, 8009, 8060, 32400, 1400, 62078, 445,
];
```

Same trick, stronger: to send the TCP SYN, the kernel must ARP-resolve the
target — so the host lands in the neighbor table **whether it accepts (SYN-ACK)
or refuses (RST)**. Either proves it's alive. And this needs *no raw sockets and
no privileges*, unlike a real ARP or SYN scan — it's just `TcpStream::connect`
(`probe.rs:1-11`).

There's a bonus: a port that actually *accepts* is a strong hint about the device
type (9100 → printer, 8009 → Chromecast, 62078 → iPhone). So the probe returns
the map of open ports for the classifier to use later.

```rust
match timeout(CONNECT_TIMEOUT, TcpStream::connect(addr)).await {
    Ok(Ok(_stream)) => Some((ip.to_string(), port)),  // accepted → record it
    _ => None,                                          // refused/timeout: job still done
}
```

400 connections in flight at once (`CONCURRENT_PROBES`, sized to stay under the
1024 open-file limit), 400 ms timeout each.

### 2c. mDNS listening — `mdns.rs`

While the two active probes hammer the network, a **passive** mDNS listener runs
in parallel. Many devices *announce themselves* over multicast DNS (`_ipp._tcp`
for printers, `_googlecast._tcp` for Chromecasts, `_sonos._tcp` for Sonos…).
This is the single best identity signal — the device *tells* you what it is,
often with a friendly name ("Living room clock") and a hardware model
("MacBookPro18,3"). Beacon browses ~30 service types (`SERVICE_KINDS`,
`mdns.rs:11`) via the pure-Rust `mdns-sd` crate.

> **Rust note:** `mdns-sd` is blocking, so it runs inside
> `tokio::task::spawn_blocking` (`mdns.rs:87`) — the right tool for wrapping
> synchronous work so it doesn't stall the async runtime's worker threads.

---

## Stage 3 — Reading the ground truth

After the provocation window, `neighbor_table()` (`platform/mod.rs:122`) reads
the now-populated table: `ip neigh show` on Linux (which carries a
`REACHABLE`/`STALE`/… state) or `arp -a` elsewhere. Entries are filtered to the
scan's subnet (`mod.rs:52-56`). **This list — not the ping/probe results — is the
authoritative "who exists."** The probes were only there to fill it.

---

## Stage 4 — Enriching each bare entry

Each neighbor is now `{ip, mac, reachable}`. Three enrichments turn that into an
identified device (`build_device`, `mod.rs:90`).

### 4a. Vendor from the MAC — `oui.rs`

The first 24+ bits of a MAC are an IEEE-assigned vendor prefix (OUI). Beacon
embeds the **entire IEEE registry** (the Wireshark `manuf` list) into the binary
at compile time:

```rust
static OUI_DATA: &str = include_str!("../data/oui.tsv");
```

IEEE hands out blocks at three sizes — MA-L (24-bit), MA-M (28-bit), MA-S
(36-bit) — so `lookup_vendor` (`oui.rs:64`) checks **most-specific first**: try
the 36-bit key, then 28, then 24. That matters because a single 24-bit block can
be subdivided and resold; the 28-bit match is a different company than the 24-bit
fallback (there's a test for exactly this at `oui.rs:112`). The table is built
once, lazily, and cached in a `OnceLock`.

> **Rust note:** `include_str!` bakes the file's contents into the executable as a
> `&'static str` — no runtime file I/O, no "where did my data file go" deployment
> problem. The parsed table lives in a `OnceLock` (initialize-once, then shared
> immutably forever), the idiomatic pattern for expensive global lookup tables.

### 4b. Randomized-MAC detection

Modern phones rotate a *random* MAC per network for privacy. Beacon detects this
from a single bit — the "locally administered" bit of the first octet
(`oui.rs:94`):

```rust
pub fn is_randomized_mac(mac: &str) -> bool {
    let hex: String = mac.chars().filter(|c| c.is_ascii_hexdigit()).take(2).collect();
    u8::from_str_radix(&hex, 16).map(|b| b & 0x02 != 0).unwrap_or(false)
}
```

A randomized MAC won't match the OUI table (it's not a real vendor prefix), and
the UI flags it so you understand why that device has no vendor.

### 4c. Hostname from reverse DNS / mDNS — `hostname.rs`

`resolve_many` (`hostname.rs:41`) does a batch reverse-DNS lookup for every IP.
The key engineering lesson here is about **latency**: a naive "one lookup process
per host" would spawn hundreds of processes, each potentially blocking for
seconds before failing — that dominated scan time. So every platform resolves the
*whole batch in a single process*:

- **Windows** fires all lookups concurrently in-process via
  `[System.Net.Dns]::GetHostEntryAsync` and `Task.WaitAll` with a 2 s budget
  (`hostname.rs:106`).
- **Unix** fans out bounded-concurrent `getent hosts` (Linux) or `dscacheutil`
  (macOS — it has no `getent`) under one `xargs -P 16` process (`hostname.rs:57`).

Results are then cleaned: `trim_suffix` strips `.local`/`.lan`, and
`is_meaningful` (`hostname.rs:25`) rejects junk like systemd's synthetic
`_gateway` and routers that just echo their MAC back as a hostname.

A friendly **mDNS** name always wins over a reverse-DNS name when both exist
(`mod.rs:105`) — "Living room clock" beats "192-168-1-42".

### 4d. Classification — the weighted-vote classifier (`classify.rs`)

This is the crown jewel. Given up to four fuzzy signals — mDNS service/model,
open ports, hostname keywords, and vendor — decide the device *kind* (phone, tv,
printer, nas, camera, …). Rather than trust the single strongest signal blindly,
**every signal casts a weighted vote and the highest total wins** (`classify.rs:195`):

```rust
let votes: [(Option<&str>, i32); 7] = [
    (mdns.and_then(|h| h.kind),                          W_MDNS_STRONG), // 100
    (mdns model → MODEL_KINDS,                           W_MDNS_MODEL),  // 60
    (strong_port_kind(open_ports),                       W_STRONG_PORT), // 55
    (hostname → HOSTNAME_KINDS,                          W_HOSTNAME),    // 40
    (vendor   → VENDOR_KINDS,                            W_VENDOR),      // 25
    (mdns.and_then(|h| h.kind_hint),                     W_MDNS_HINT),   // 15
    (weak_port_kind(open_ports),                         W_WEAK_PORT),   // 12
];
```

The weights encode *trust*: a definitive mDNS service (a device literally
advertising `_googlecast._tcp`) scores 100 and decides the kind outright; a
vendor name is a weak 25 (Apple makes phones, tablets, computers, TVs and
speakers — it barely narrows anything). The scoring only changes the outcome when
several weak signals corroborate against a lone noisy one. Ties break toward the
*more specific* kind (nas over computer, camera over iot), via ordering in
`KIND_NAMES` (`classify.rs:185`).

Two hard short-circuits come first: the gateway is always `"router"`, and this
machine is always `"computer"` (`classify.rs:203`).

The pattern tables themselves (`HOSTNAME_KINDS`, `VENDOR_KINDS`, `MODEL_KINDS`)
are big ordered lists of regexes, most-specific-first, so `android-tv` types as a
TV not a phone, and a Kasa smart plug types as IoT even though TP-Link mostly
makes routers. There's a whole test suite (`classify.rs:251`) pinning down the
tricky cases — an iPad (tablet) vs iPhone (phone), "Camerons-MacBook-Pro" not
tripping the "cam"→camera rule, a Plex port reading as NAS-class.

> **Rust note:** the tally uses two fixed-size arrays indexed by kind
> (`total[KIND_COUNT]`, `best_single[KIND_COUNT]`) — no allocation, no HashMap,
> just integer indexing. Comparing `(total, best_single)` tuples gives
> lexicographic tie-breaking for free, because Rust derives `Ord` on tuples
> field-by-field.

---

## Stage 5 — Assembly

Finally (`mod.rs:77-88`):

- **Add this machine.** The local host never appears in its own neighbor table,
  so `add_self_if_missing` injects it, with the hostname from
  `local_machine_name` (`hostname.rs:144` — tries `/etc/hostname`, then
  `COMPUTERNAME`/`HOSTNAME` env vars, then the `hostname` binary).
- **Sort** gateway first, then self, then numerically by IP
  (`sort_by_key((!is_gateway, !is_self, ip_sort_key))` — `false < true`, so the
  negation floats the special ones to the top).
- **Dedupe by MAC** so a host with two IPs shows once.

The result is a `LanDeviceScan` that serializes across the IPC bridge (see the
[main learning doc](./learning-rust-and-tauri.md)) to the Devices screen.

---

## Security & privacy touches

Because device names and models come *off the network* from untrusted neighbors,
every such string passes through `sanitize_display` (`net_util.rs:65`) before it's
stored or rendered — stripping control characters and Unicode bidi overrides so a
hostile device can't inject terminal escapes or right-to-left text into your
device list. And every IP interpolated into a `ping`/`getent` shell command is
first validated by `is_shell_safe_ip` (it must parse as a real `IpAddr`), closing
the shell-injection path.

---

## The whole thing in one diagram

```
        subnet 192.168.1.0/24
                │
   ┌────────────┼───────────────┬──────────────┐   all concurrent, ~3.2s
   ▼            ▼               ▼              (passive)
 ICMP sweep   TCP connect    (open ports)     mDNS listen
 (ping bait) (SYN/RST bait)   → classifier    (self-announced identity)
   └──────┬─────┘                                    │
          ▼  provokes ARP resolution                 │
   kernel neighbor table  ◄── ground truth: who exists
          │                                           │
          ▼  per host                                 │
   enrich: OUI vendor · reverse-DNS hostname ─────────┘ (mDNS name/model/kind)
          │
          ▼
   classify(): weighted vote over {mdns, ports, hostname, vendor} → kind
          │
          ▼
   + self · sort(gateway,self,ip) · dedupe(mac)  →  LanDeviceScan → IPC → UI
```

**The philosophy:** you can't ask the network "who are you," so you *provoke*
everyone into the kernel's neighbor table using unprivileged bait traffic, treat
that table as ground truth, then fuse every weak identity signal you can scrape
(vendor prefix, reverse DNS, self-announcements, open ports) with a trust-weighted
vote to guess what each device actually is.
