"""Builds dist/home-page.html: every file Home is made of, its code beside plain-words notes.

Run from anywhere: python3 docs/learning/home-page/build.py
Notes are keyed by line number in the last commit's code, so a file that
changes needs its notes checked."""
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parents[2]

page_notes = {}
exec((HERE / 'page_notes.py').read_text(), {}, page_notes)
lib = {}
exec((HERE / 'library_notes.py').read_text(), {}, lib)
hooks = {}
exec((HERE / 'hook_notes.py').read_text(), {}, hooks)
terms = {}
exec((HERE / 'terms.py').read_text(), {}, terms)
codify_ns = {}
exec((HERE / 'codify.py').read_text().split("if __name__")[0], codify_ns)
codify = codify_ns['codify']

# (id, group, title, path, notes, blurb, used)
ENTRIES = [
    ('home-view', 'The page', 'HomeView', 'apps/rove/src/features/home/HomeView.tsx', page_notes['HOME_VIEW'],
     'Decides which cards appear and in what order. It draws nothing itself.', None),
    ('connection-card', 'The cards', 'ConnectionCard', 'apps/rove/src/features/current-network/ConnectionCard.tsx', page_notes['CONNECTION_CARD'],
     'The network card: the box, and opening and closing its details.', None),
    ('connection-strip', 'The cards', 'ConnectionStrip', 'apps/rove/src/features/current-network/components/ConnectionStrip.tsx', page_notes['CONNECTION_STRIP'],
     'The row you always see: icon, network name, meta line, share button and arrow.', None),
    ('connection-details', 'The cards', 'ConnectionDetailsPanel', 'apps/rove/src/features/current-network/components/ConnectionDetailsPanel.tsx', page_notes['DETAILS_PANEL'],
     'The list that slides open when you click the network card.', None),
    ('signal-meter', 'The cards', 'SignalMeter', 'apps/rove/src/features/current-network/components/SignalMeter.tsx', page_notes['SIGNAL_METER'],
     'The four signal bars, coloured by how good the signal is.', None),
    ('traffic-card', 'The cards', 'TrafficCard', 'apps/rove/src/features/live-throughput/TrafficCard.tsx', page_notes['TRAFFIC_CARD'],
     'Live download and upload rates over a chart of the last minute.', None),
    ('speed-readout', 'The cards', 'SpeedReadout', 'apps/rove/src/features/live-throughput/components/SpeedReadout.tsx', page_notes['SPEED_READOUT'],
     'One of the Traffic card’s big numbers, counting up to each new value.', None),
    ('capabilities-card', 'The cards', 'CapabilitiesCard', 'apps/rove/src/features/capabilities/CapabilitiesCard.tsx', page_notes['CAPABILITIES'],
     'A tile per activity, coloured by the last speed test, with a footer.', None),
    ('run-test-button', 'The cards', 'RunTestButton', 'apps/rove/src/features/capabilities/components/RunTestButton.tsx', page_notes['RUN_TEST_BUTTON'],
     'The Capabilities card’s run-test button.', None),
    ('capability-tiles', 'The cards', 'CapabilityTiles', 'apps/rove/src/features/capabilities/components/CapabilityTiles.tsx', page_notes['CAPABILITY_TILES'],
     'The tiles: rated ones open their details; grey ones wait for a test.', None),
    ('capabilities-footer', 'The cards', 'CapabilitiesFooter', 'apps/rove/src/features/capabilities/components/CapabilitiesFooter.tsx', page_notes['CAPABILITIES_FOOTER'],
     'The band under the tiles: when they were tested, and a link to Speed.', None),
    ('stat-card', 'The cards', 'StatCard', 'apps/rove/src/features/home/components/StatCard.tsx', page_notes['STAT_CARD'],
     'The layout the two small cards share: a title over one readout.', None),
    ('usage-card', 'The cards', 'UsageCard', 'apps/rove/src/features/home/components/UsageCard.tsx', page_notes['USAGE_CARD'],
     'Today’s downloaded and uploaded data.', None),
    ('devices-card', 'The cards', 'DevicesCard', 'apps/rove/src/features/home/components/DevicesCard.tsx', page_notes['DEVICES_CARD'],
     'How many devices are online, with a Discover button on macOS.', None),
    ('card', 'Library', 'Card', 'packages/ui/src/card/Card.tsx', lib['CARD'],
     'The panel every card is built from.', 'Every card on Home. The small cards pass onOpen, which makes the whole card a link.'),
    ('card-context', 'Library', 'card-context', 'packages/ui/src/card/context/card-context.ts', lib['CARD_CONTEXT'],
     'What a Card tells the CardHeader inside it.', 'Shared by `Card` and `CardHeader`.'),
    ('card-header', 'Library', 'CardHeader', 'packages/ui/src/card/components/CardHeader.tsx', lib['CARD_HEADER'],
     'The card’s 44px title row.', 'Every card on Home.'),
    ('card-body', 'Library', 'CardBody', 'packages/ui/src/card/components/CardBody.tsx', lib['CARD_BODY'],
     'The card’s padded body.', 'Every card on Home.'),
    ('card-footer', 'Library', 'CardFooter', 'packages/ui/src/card/components/CardFooter.tsx', lib['CARD_FOOTER'],
     'A sunken band at the card’s foot.', 'Not on Home: the Capabilities card builds its own footer.'),
    ('collapsible', 'Library', 'Collapsible', 'packages/ui/src/collapsible/Collapsible.tsx', lib['COLLAPSIBLE'],
     'Shows and hides a panel from a trigger, with the accessibility built in.', 'The network card: its strip is the trigger, the details are the panel.'),
    ('collapsible-trigger', 'Library', 'CollapsibleTrigger', 'packages/ui/src/collapsible/components/CollapsibleTrigger.tsx', lib['COLLAPSIBLE_TRIGGER'],
     'The button that opens and closes the panel.', 'The network card’s strip.'),
    ('collapsible-panel', 'Library', 'CollapsiblePanel', 'packages/ui/src/collapsible/components/CollapsiblePanel.tsx', lib['COLLAPSIBLE_PANEL'],
     'The part that opens and closes.', 'The network card’s details.'),
    ('data-list', 'Library', 'DataList', 'packages/ui/src/data-list/DataList.tsx', lib['DATA_LIST'],
     'A list of label and value rows.', 'The network card’s details: Network name, Signal, Link speed…'),
    ('data-row', 'Library', 'DataRow', 'packages/ui/src/data-list/components/DataRow.tsx', lib['DATA_ROW'],
     'One label and its value.', 'Each line of the network card’s details.'),
    ('icon-tile', 'Library', 'IconTile, IconTileButton', 'packages/ui/src/icon-tile/IconTile.tsx', lib['ICON_TILE'],
     'A rounded square holding an icon, tinted by what it stands for; the button version opens something.', 'The network card’s icon, and the capability tiles.'),
    ('inline-meta', 'Library', 'InlineMeta', 'packages/ui/src/separator/DotSeparator.tsx', lib['DOT_SEPARATOR'],
     'A line of items with a small dot between each.', 'The network card’s meta line, and the capability tooltips.'),
    ('no-value', 'Library', 'NoValue', 'packages/ui/src/no-value/NoValue.tsx', lib['NO_VALUE'],
     'A short drawn bar where a value would be but there’s none.', 'Missing details rows, and the small cards before their data loads.'),
    ('readout', 'Library', 'Readout', 'packages/ui/src/readout/Readout.tsx', lib['READOUT'],
     'A number and its unit, with an optional label and icon.', 'The Traffic card’s speeds, and the Usage and Devices figures.'),
    ('bar-meter', 'Library', 'BarMeter', 'packages/ui/src/bar-meter/BarMeter.tsx', lib['BAR_METER'],
     'Four rising bars, some lit, drawn crisply at any display scaling.', 'The signal bars, through SignalMeter.'),
    ('status-dot', 'Library', 'StatusDot', 'packages/ui/src/status-dot/StatusDot.tsx', lib['STATUS_DOT'],
     'A small dot marking a status, with an optional pulse.', 'The Devices card’s “online” dot, and the Live badge.'),
    ('direction-icon', 'Library', 'DirectionIcon', 'packages/ui/src/icons/DirectionIcon.tsx', lib['DIRECTION_ICON'],
     'The blue down arrow and purple up arrow for download and upload.', 'The Traffic card and the Usage card.'),
    ('button', 'Library', 'Button', 'packages/ui/src/button/Button.tsx', lib['BUTTON'],
     'A text button, solid or soft, with disabled and loading states.', 'Devices’ Discover button.'),
    ('icon-button', 'Library', 'IconButton', 'packages/ui/src/button/IconButton.tsx', lib['ICON_BUTTON'],
     'A square icon-only button with a tooltip.', 'The Capabilities card’s run-test button.'),
    ('button-spinner', 'Library', 'ButtonSpinner', 'packages/ui/src/spinner/ButtonSpinner.tsx', lib['BUTTON_SPINNER'],
     'A small spinning ring that fits inside a button.', 'The run-test button while testing, and the Devices card while scanning.'),
    ('link', 'Library', 'Link', 'packages/ui/src/link/Link.tsx', lib['LINK'],
     'A link at the size of its text, to another view or a web address.', 'The Capabilities card’s “Speed test ›”.'),
    ('live-badge', 'Library', 'LiveBadge', 'packages/ui/src/badge/Badge.tsx', lib['BADGE'],
     'A pill with a pulsing dot saying the data is live.', 'The Traffic card’s header.'),
    ('screen-reader-status', 'Library', 'ScreenReaderStatus', 'packages/ui/src/screen-reader/ScreenReaderStatus.tsx', lib['SCREEN_READER_STATUS'],
     'A line only screen readers hear, read out when it changes.', 'The Capabilities card, to announce a test’s progress.'),
    ('tooltip', 'Library', 'Tooltip', 'packages/ui/src/tooltip/Tooltip.tsx', lib['TOOLTIP'],
     'A short hint on hover and keyboard focus.', 'The capability tiles, and every IconButton.'),
    ('use-count-up', 'Library', 'useCountUp', 'packages/ui/src/hooks/useCountUp.ts', lib['USE_COUNT_UP'],
     'Eases a displayed number toward its new value, frame by frame.', 'The Traffic card’s speeds, through SpeedReadout.'),
    ('use-roving-focus', 'Library', 'useRovingFocus', 'packages/ui/src/hooks/useRovingFocus.ts', lib['USE_ROVING_FOCUS'],
     'Makes a group of items one Tab stop, moved through with the arrow keys.', 'The row of capability tiles.'),
    ('query-client', 'Hooks and data', 'queryClient', 'apps/rove/src/app/utils/query-client.ts', hooks['QUERY_CLIENT'],
     'The app\u2019s one React Query cache, and the rules every query starts from.', 'Every card\u2019s backend data is stored here.'),
    ('app', 'Hooks and data', 'App', 'apps/rove/src/app/App.tsx', hooks['APP'],
     'The top of the app: the query cache and the app-wide providers wrap everything.', 'Home sits inside all of these, so its cards can read them.'),
    ('use-backend-query', 'Hooks and data', 'useBackendQuery', 'apps/rove/src/hooks/useBackendQuery.ts', hooks['USE_BACKEND_QUERY'],
     'Rove\u2019s wrapper around React Query\u2019s `useQuery`, with its rules for opening, polling and busy states.', 'Under the device scan and usage reads.'),
    ('network-provider', 'Hooks and data', 'NetworkProvider', 'apps/rove/src/app/context/NetworkProvider.tsx', hooks['NETWORK_PROVIDER'],
     'Owns the app-wide network state and shares it through context.', 'Gives Home its network info, and starts the live traffic feed.'),
    ('use-network-info-source', 'Hooks and data', 'useNetworkInfoSource', 'apps/rove/src/app/hooks/useNetworkInfoSource.ts', hooks['USE_NETWORK_INFO_SOURCE'],
     'Reads the network info with React Query, polling every 15 seconds.', 'The network card\u2019s data, through `useNetwork()`.'),
    ('use-network', 'Hooks and data', 'useNetwork', 'apps/rove/src/app/hooks/useNetwork.ts', hooks['USE_NETWORK'],
     'Reads the shared network state from context.', '`HomeView`, the network card, and several hooks.'),
    ('use-navigation', 'Hooks and data', 'useNavigation', 'apps/rove/src/app/hooks/useNavigation.ts', hooks['USE_NAVIGATION'],
     'Where the app is, and how to move to another tab.', 'Every card that opens another tab.'),
    ('use-network-key', 'Hooks and data', 'useNetworkKey', 'apps/rove/src/app/hooks/useNetworkKey.ts', hooks['USE_NETWORK_KEY'],
     'A short name for the current network, for query keys.', 'The device scan\u2019s cache key.'),
    ('use-details-expanded', 'Hooks and data', 'useDetailsExpanded', 'apps/rove/src/features/current-network/hooks/useDetailsExpanded.ts', hooks['USE_DETAILS_EXPANDED'],
     'Remembers whether the network card is open, as a saved setting.', 'The network card.'),
    ('use-data-usage', 'Hooks and data', 'useDataUsage', 'apps/rove/src/features/usage/hooks/useDataUsage.ts', hooks['USE_DATA_USAGE'],
     'The last week\u2019s data use, polled every 2 seconds.', 'The Usage card.'),
    ('use-usage-query', 'Hooks and data', 'useUsageQuery', 'apps/rove/src/hooks/useUsageQuery.ts', hooks['USE_USAGE_QUERY'],
     'A React Query read for usage data, with polling and an empty value.', 'Under `useDataUsage`.'),
    ('use-devices', 'Hooks and data', 'useDevices', 'apps/rove/src/features/devices/hooks/useDevices.ts', hooks['USE_DEVICES'],
     'The device scan, shared by Home, Devices and Events through one cache entry.', 'The Devices card.'),
    ('use-can-run-speed-test', 'Hooks and data', 'useCanRunSpeedTest', 'apps/rove/src/features/speed/hooks/useCanRunSpeedTest.ts', hooks['USE_CAN_RUN_SPEED_TEST'],
     'Whether a speed test can start now.', 'The run-test button.'),
    ('use-throughput-scale', 'Hooks and data', 'useThroughputScale', 'apps/rove/src/features/live-throughput/hooks/useThroughputScale.ts', hooks['USE_THROUGHPUT_SCALE'],
     'The Traffic chart\u2019s top value.', 'The Traffic card.'),
    ('use-speed-test', 'Hooks and data', 'useSpeedTest', 'apps/rove/src/features/speed/hooks/useSpeedTest.ts', hooks['USE_SPEED_TEST'],
     'The speed test: a store outside React that keeps the last result and a running test across tab switches.', '`HomeView` and the Capabilities card.'),
    ('use-live-throughput', 'Hooks and data', 'useLiveThroughput', 'apps/rove/src/features/live-throughput/hooks/useLiveThroughput.ts', hooks['USE_LIVE_THROUGHPUT'],
     'The live traffic feed: a store filled by samples the backend pushes every second.', 'The Traffic card.'),
]

files = []
for entry_id, group, title, path, notes, blurb, used in ENTRIES:
    # The last commit, not the working tree: another session's half-done edit
    # would shift the lines the notes point at.
    code = subprocess.run(['git', '-C', str(ROOT), 'show', f'HEAD:{path}'], capture_output=True, text=True, check=True).stdout.rstrip('\n')
    files.append({'id': entry_id, 'group': group, 'title': title, 'path': path,
                  'blurb': codify(blurb), 'used': codify(used) if used else None,
                  'code': code, 'lineCount': code.count('\n') + 1,
                  'notes': [{'line': n, 'text': codify(t)} for n, t in sorted(notes)]})

template = (HERE / 'reader.template.html').read_text()
data = json.dumps(files).replace('</', '<\\/')
term_data = json.dumps([{'label': label, 'forms': forms, 'def': definition} for label, forms, definition in terms['TERMS']]).replace('</', '<\\/')
# dist/ is build output: git and Prettier both ignore it.
output_path = HERE / 'dist' / 'home-page.html'
output_path.parent.mkdir(exist_ok=True)
output_path.write_text(template.replace('/*__DATA__*/ []', data).replace('/*__TERMS__*/ []', term_data))
print('files', len(files), 'notes', sum(len(f['notes']) for f in files), 'lines', sum(f['lineCount'] for f in files))
