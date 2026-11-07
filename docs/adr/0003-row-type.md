---
status: accepted
date: 2026-11-07
---

# A list row's name is 12px and the rest of it 11px; a data row's label and value share 12px

Rows had drifted: the same IP address was 11, 12 or 13px depending on the
screen, and values beside names were bigger than their meta. Now a list row
(Apps, Services, Devices, Timeline) sets its name in Body and everything
else in Caption: totals, latencies, hosts, addresses, statuses, times and
durations. A data row (Connection, Interfaces, Home's details) is a label and
value pair, so both are Body. Status words are regular weight; their colour
already marks them.

## Considered options

- **Name and value at 12, meta at 11.** Tried first; a value beside the name
  read as bigger than it mattered, so values joined the meta.
