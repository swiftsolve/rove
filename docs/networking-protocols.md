# The Networking Protocols Behind Rove's Device Discovery

Rove's Devices screen leans on a stack of networking protocols to answer two
questions: **who is on my network** and **what is each thing?** No single
protocol answers both, so Rove fuses several. This page is a plain-language
glossary of every acronym that shows up in the discovery pipeline
(`crates/rove-core/src/devices/`) and where each one fits.

If you want the full pipeline walkthrough, see
[`device-discovery.md`](./device-discovery.md). This page is the "what does that
acronym even mean" companion.

---

## The core plumbing

**IP address** — the numeric address of a device on a network (e.g.
`192.168.1.42`). Your **subnet** (typically a `/24`) is the block of addresses on
your local network — about 254 usable hosts.

**MAC address** — the hardware address burned into a network adapter (e.g.
`a4:83:e7:1b:...`). Unlike an IP, which can change, it's tied to the physical
device. The first half identifies the manufacturer (the **OUI**, below).

**ARP (Address Resolution Protocol)** — the glue between IP and MAC. When your
machine wants to reach `192.168.1.42`, it asks "who has that IP?" and the owner
replies with its MAC. The OS caches these answers in the **neighbor table**
(a.k.a. the ARP cache). Rove treats this table as ground truth for *who exists* —
every device that has communicated recently appears in it.

---

## Waking the network up

**ICMP (Internet Control Message Protocol)** — the protocol behind `ping`. It's
for network control and diagnostics, not carrying data. Rove pings every host in
the subnet not to hear the reply, but because sending a ping forces an ARP
exchange, which lands even a silent device in the neighbor table.

**TCP (Transmission Control Protocol)** — the reliable, connection-based protocol
most apps use (web, SSH, file sharing). A connection begins with a handshake
(SYN → SYN-ACK). Rove's probe tries to open TCP connections to telling **ports** —
this reaches devices that ignore ping, and a port that answers is a strong clue
about the device type.

**Port** — a numbered channel on a device, each tied to a service. Rove knocks on
ports like `80` (web), `22` (SSH), `9100` (printer), `62078` (iPhone).

---

## "Devices announce themselves"

**DNS (Domain Name System)** — translates names to IPs (`google.com` → an IP).
**Reverse DNS** goes the other way: IP → hostname. Rove uses reverse DNS to get a
name for each device.

**mDNS (multicast DNS)** — "DNS without a server." Devices on the local network
announce their own names and services by multicast. Apple calls this **Bonjour**.
It's how your Mac sees "Living Room Apple TV" with zero configuration. Rove
listens for these announcements — devices literally broadcast what they are,
often with a friendly name and hardware model.

**SSDP (Simple Service Discovery Protocol)** — the discovery half of **UPnP**
(below). Rove sends a multicast "anyone out there?" message (`M-SEARCH`) to
`239.255.255.250:1900`; UPnP devices reply with a URL pointing to a description
of themselves.

**UPnP (Universal Plug and Play)** — a family of protocols letting devices
describe their capabilities (media players, routers, smart TVs). After SSDP finds
a device, Rove fetches its UPnP **description** (an XML document) to read its
friendly name, model, manufacturer, and `deviceType`.

**NetBIOS** — an old Microsoft naming protocol still used by Windows/SMB
file-sharing machines. Rove sends an **NBSTAT** query to UDP port 137 to get the
real Windows computer name.

**DHCP (Dynamic Host Configuration Protocol)** — how devices *get* an IP address
when they join a network. When a phone connects to Wi-Fi, it broadcasts a DHCP
request carrying a **fingerprint**: Option 55 (the list of settings it asks for)
and Option 60 (a vendor string like `android-dhcp-14`). Different operating
systems ask in distinctive patterns, so Rove passively listens and uses this to
tell "phone" from "computer." It even survives MAC randomization, because it's
about *how* a device asks, not its identity.

---

## Identity lookups

**OUI (Organizationally Unique Identifier)** — the first 24 bits of a MAC
address, assigned by the IEEE to each manufacturer. Rove ships an offline copy of
the IEEE registry, so `a4:83:e7` → "Apple", `00:0e:58` → "Sonos". This yields the
vendor.

---

## Protocols that hint at device *type* (via open ports)

What a listening port tells Rove:

| Protocol | Port | Suggests |
|----------|------|----------|
| HTTP / HTTPS | 80 / 443 | Has a web UI — routers, cameras, printers |
| SSH | 22 | A computer, NAS, or Raspberry Pi |
| IPP / JetDirect | 631 / 9100 | A printer |
| RTSP (Real-Time Streaming) | 554 | An IP camera |
| Chromecast / Roku | 8009 / 8060 | A TV or streaming box |
| lockdownd | 62078 | An iPhone/iPad (Apple-only) |
| SMB | 445 | Windows file sharing — computer or NAS |
| Plex | 32400 | A media server (NAS-class box) |
| Sonos | 1400 | A speaker |

---

## How it all fits together

Rove combines these because **no single protocol sees everything**:

- **ARP / neighbor table** answers *who exists*.
- **ICMP + TCP** force silent devices to reveal themselves to ARP.
- **mDNS, SSDP/UPnP, NetBIOS, DHCP, reverse DNS** each answer *what is this
  device* from a different angle — and a trust-weighted vote reconciles them (a
  mDNS "Sonos speaker" announcement is trusted far more than a guess from an open
  port).

A device that ignores ping, announces nothing, and uses a randomized MAC can
still hide — which is why the router's admin page stays authoritative. But most
devices leak their identity through at least one of these protocols.
