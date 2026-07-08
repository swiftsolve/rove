# Why "Rove"?

The app was originally called **beacon**. This page explains why it's now
**Rove**: what the name evokes and why it fits what the product actually does.

> This is a naming-rationale doc, not a spec. It captures the *fit* between the
> name and the product; it isn't a record of every alternative that was weighed.

---

## The one-line reason

**To rove is to move freely, watching as you go.** That's exactly what this app
is: a small, always-on companion that follows your network wherever it goes,
across Wi-Fi and Ethernet and from one access point to the next, and keeps a
clear eye on what's happening.

## Why it fits the product

**Networks roam; so does Rove.** A modern connection is not one fixed thing. You
pull a cable, join a new SSID, drift between bands, walk from one router to
another. Rove is built around that motion: the backend watches `ip monitor route`
and re-reads the kernel routing table so the UI follows your *real* path within a
second of any change (see the connection-card section in the [README](../README.md)
and [How Rove Captures Network Data](./networking-data-capture.md)). The name
names that behaviour: the app doesn't assume a static setup, it **roves** with
you.

**A roving eye over the LAN.** Beyond your own link, Rove sweeps the local
network, discovering and identifying every device on the subnet without admin
rights (see [How Rove Discovers & Identifies LAN Devices](./device-discovery.md)).
"Rove" carries that sense of *ranging over an area to see what's there*.

**Light-footed, not anchored.** A *beacon* is a fixed point that sits still and
signals. This app is the opposite in spirit: minimal, quick, and mobile. It goes
where your attention goes (live traffic, a speed test, a device scan, a
diagnostic) rather than broadcasting from one spot. The rename trades a
stationary metaphor for a mobile one that matches the product's feel.

## What the word carries

- **rove** (verb): to wander or range over a wide area, especially without a
  fixed destination; *a roving reporter*, *a roving eye*.
- Short, one syllable, easy to say and type. Reads well as a window title, a
  binary name (`target/debug/Rove`), and a command.
- Neutral and modern, with no networking cliché (no *net-*, *-ify*, *-scan*, or
  *signal* suffixes), which leaves room for the product to be more than a single
  tool.

## In short

The product is a fast, mobile, watchful companion for a connection that never
holds still. **Rove**, to move freely and observe, says that in one word, where
the old **beacon** implied something fixed and one-directional.
