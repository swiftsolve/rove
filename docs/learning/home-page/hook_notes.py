QUERY_CLIENT = [
    (1, "From TanStack Query (React Query): the client that holds the cache, and the pieces used to configure it."),
    (3, "React Query normally refetches when the window gets focus. This makes it listen for the window being shown or hidden instead, the same signal the rest of the app uses to pause and resume."),
    (12, "The app's one cache. Every query in the app lives here, keyed by name, so two screens asking for the same data share one answer."),
    (19, "When any query or mutation fails, log it to the console, so a failure shown as text on screen also leaves a trace for debugging."),
    (21, "Defaults for every query:"),
    (24, "Don't retry a failed read automatically: show the error at once. The next poll or a reload is the retry."),
    (27, "Keep results for as long as the app runs, so a screen you return to shows its last result instantly while it refreshes."),
    (30, "Don't refetch on window focus or when the network reconnects, unless a query asks for it."),
    (35, "Always run queries, even offline. React Query normally pauses when the machine is offline, but every read here goes to Rove's own backend, and offline is exactly when a network monitor matters."),
]

APP = [
    (1, "The component that makes the query cache available to everything inside it."),
    (3, "The app's frame, and the providers that hold app-wide state: navigation, theme, network."),
    (7, "The one query client from query-client.ts."),
    (10, "The whole app. Each provider wraps the next, so everything inside can read what it provides."),
    (12, "The outermost layer: every component, Home's cards included, can now use React Query hooks against the same cache."),
    (13, "Then navigation (which tab is open), the theme, and the network (Wi-Fi details, internet status)."),
    (16, "The visible app: title bar, nav rail and the current screen, Home among them."),
]

USE_BACKEND_QUERY = [
    (1, "From React Query: hashKey turns a key into a string, skipToken means \"don't fetch\", and useQuery is the core hook."),
    (4, "The options every backend read gives:"),
    (6, "queryKey: the data's name in the cache, like ['devices', network]. The same key means the same shared answer."),
    (8, "queryFn: the function that asks the backend; () => Promise<T> means it returns a promise of the data. Missing when there's no backend (a plain web build), and then nothing fetches."),
    (10, "isEnabled: true while a screen showing the data is open. A closed query keeps its data but stops fetching."),
    (12, "errorMessage: the text to show if the failure has no message of its own."),
    (13, "freshForMs: how long a result counts as current, so opening another screen within that time reuses it without refetching."),
    (20, "pollIntervalMs: refetch quietly at this interval while open and visible."),
    (21, "shouldForgetWhenClosed: drop the data as soon as no screen shows it, for things that shouldn't linger, like a Wi-Fi password."),
    (28, "What the hook gives back: the data, isBusy (a visible load is running), an error message, reload (fetch now, showing busy), refresh (fetch now, quietly), and when the data last landed."),
    (44, "A result counts as current for 10 seconds by default, so a quick Home → Devices swap doesn't fetch twice."),
    (46, "Turns any error into text."),
    (60, "Starts useBackendQuery: React Query's useQuery with the app's rules for opening, polling and busy states."),
    (69, "Whether it can fetch at all (is there a backend?)."),
    (72, "Remembers which key has finished its opening fetch, so later fetches count as quiet polls, not visible loads."),
    (76, "The actual React Query call:"),
    (77, "the key, the fetch function (or skipToken to fetch nothing),"),
    (79, "only while enabled; a result stays fresh for freshForMs; poll every pollIntervalMs if set;"),
    (82, "forget the data at once if asked; refetch on window focus only for polled queries;"),
    (86, "and once open, re-render only when the data or error changes, not every time a background poll starts or stops."),
    (88, "Takes what's needed from React Query's result."),
    (91, "Notes when the opening fetch is over."),
    (95, "Counts manual reloads in flight, so this screen can show them as busy."),
    (96, 'reload(): fetch now and show the busy state. Count one more reload, await the refetch, and in finally count it back down, even if the fetch failed, so busy never gets stuck on.'),
    (106, 'refresh(): fetch now without the busy state, joining any fetch already running. For an update nobody clicked for. Both are async, so a caller can await them.'),
    (110, "isBusy is true for the opening fetch or a manual reload, never a background poll. The error is hidden during the opening fetch, so an old error doesn't flash up."),
    (114, "Hands everything back to the caller."),
]

NETWORK_PROVIDER = [
    (3, "The three contexts it fills, and the helpers that produce their values."),
    (12, "NetworkProvider sits near the top of the app and owns all network state. Each value has its own context, so a component re-renders only when the value it reads changes."),
    (17, "Starts the provider."),
    (21, "Reads the network info (a React Query poll, see useNetworkInfoSource) and whether the internet is reachable."),
    (25, "Works out the title bar's verdict (\"Wi-Fi\", \"No internet\"…) from the two, and keeps the same object until the verdict changes."),
    (29, "Starts the live traffic feed for the whole app, paused only while the window is hidden, so Home's chart is already full when you come back."),
    (33, "Provides all three values to everything inside: useNetwork(), useInternetStatus() and useConnectionStatus() read them."),
]

USE_NETWORK_INFO_SOURCE = [
    (1, "Uses React Query's useQuery directly, plus React's state and effect hooks."),
    (4, "The shared query client, the bridge to the backend, an equality check, and hooks for the backend's network-changed nudge and window visibility."),
    (11, "The cache key for network info."),
    (13, "Poll every 15 seconds, time out a read after 20, and only show an error after 3 failures in a row, keeping the last good reading on screen until then."),
    (26, "The kinds of error: timeout (the OS is slow), backend (no backend at all), offline (the read failed)."),
    (32, "What every component reading the network gets: the info, an error, when it was last read, whether it's loading, and a refresh function."),
    (45, "Wraps a read so it fails with a timeout error if it takes too long."),
    (63, "The actual read: ask the backend for network info, with the 20-second timeout."),
    (67, "Turns an error into one of the kinds above."),
    (79, "Starts the hook. NetworkProvider calls it once; everything else reads its result through useNetwork()."),
    (81, "Is there a backend? Not in a plain web build or a test."),
    (82, "The React Query call: the network-info key, the read, only with a backend, polling every 15 seconds,"),
    (90, "retrying a failed read a few times, a poll apart, but only once there's a good reading to keep showing,"),
    (94, "keeping the old object when nothing changed, so components don't re-render for an identical reading,"),
    (99, "and re-rendering only for data, error or status changes."),
    (101, "Takes what's needed from the result."),
    (106, "Manual reloads in flight (Retry, or the window coming back), shown as loading until the first reading."),
    (107, "reload(): drop any read in flight and read afresh."),
    (120, "When the window comes back after being hidden, read afresh."),
    (130, "When the backend says the network changed, read again right away."),
    (132, "Shapes the result: the info (or null), the error, when it was last read (only while there's an error), and loading."),
    (140, "Hands back one stable object, rebuilt only when one of its values changes."),
]

USE_NETWORK = [
    (1, "React's `use` reads a context."),
    (7, "useNetwork(): reads the network state that NetworkProvider shares. Home calls it to get `info`."),
    (9, "Called outside the provider: fail loudly, because that's a bug."),
]

USE_NAVIGATION = [
    (7, "useNavigation(): where the app is, and navigate() to go somewhere. The cards call navigate({ tab: 'speed' }) and so on."),
]

USE_NETWORK_KEY = [
    (3, "useNetworkKey(): a short string naming the current network (interface plus IP), used in query keys, so results from a previous network never show on a new one."),
    (10, "Null until the network is known: queries keyed on it wait until then."),
]

USE_PUBLIC_IP = [
    (3, "The network key, and the shared React Query wrapper."),
    (7, "A reading remembers which network it was read on."),
    (18, "usePublicIp(): your public IP, for the network card's details."),
    (20, "Which network we're on."),
    (21, "A React Query read, keyed by network, so a new network fetches its own IP. It runs only when connected and the network is known."),
    (31, "Keeps the last IP read on this network, so a refetch or an empty answer doesn't blank the row. Never another network's IP: that would be wrong, not just old."),
    (36, "The IP to show, and whether a visible load is running."),
]

USE_DETAILS_EXPANDED = [
    (1, "useSetting: a value saved in Rove's settings."),
    (4, "The old place this choice was saved, still read so an open card stays open after the update."),
    (18, "useDetailsExpanded(): whether the network card's details are open, saved as a setting so it survives tab switches and restarts. Returns the value and a toggle."),
]

USE_DATA_USAGE = [
    (1, "The shared usage-query helper."),
    (6, "Poll every 2 seconds, so today's total climbs as data moves."),
    (8, "What to show before the first answer: no days, zero totals."),
    (11, "useDataUsage(): the last week's data use, per day. The Usage card picks today out of it. It's a React Query read under the hood (see useUsageQuery)."),
]

USE_USAGE_QUERY = [
    (3, "Built on the shared React Query wrapper."),
    (8, "Poll every 5 seconds by default, or every 15 when the backend pushes updates."),
    (12, "Its options: the cache key, the read, an empty value, an error message, an emptiness check, a poll interval, and an optional push subscription."),
    (33, "What it gives back: the usage (never undefined), loading flags, an error and reload."),
    (50, "Starts the helper."),
    (59, "The read, if there's a backend."),
    (62, "The React Query read: always enabled while mounted, polling at the interval."),
    (71, "If the backend pushes \"new data\", re-read quietly right away."),
    (77, "No backend: a clear error rather than a spinner forever."),
    (81, "The data, or the empty value before it arrives, plus a first-load flag for a spinner."),
]

USE_DEVICES = [
    (1, "Navigation, the network key, a nudge for the events feed, and the shared React Query wrapper."),
    (8, 'What the hook gives back: whether Home may scan by itself, the last scan, whether scanning, any error, and rescan, which returns a promise that settles when the scan is done.'),
    (17, 'scanDevices is async: it returns Promise<LanDeviceScan>, the scan, later.'),
    (18, "try / finally: return await waits for the backend's scan and hands it back; finally runs afterwards whether the scan worked or failed, nudging the events feed, since a scan can create events. Without await, finally would run before the scan ended."),
    (30, "useDevices(): the device scan, shared by the Devices tab, the Home card and Events through one cache entry per network."),
    (35, "On macOS, Home never scans by itself: scanning asks for a permission, which should come from opening Devices or pressing Discover."),
    (37, "Scan when Devices is open, or on Home where that's allowed."),
    (44, "The React Query read: keyed by network, so a new network rescans; no polling, because a scan is heavy."),
    (51, "Hands back the scan, its state and rescan (React Query's reload)."),
]

USE_SPEED_HISTORY = [
    (1, "The query client, the history's read and clear functions, and the React Query wrapper."),
    (7, "The history's cache key. useSpeedTest invalidates it after saving a result, so anything showing history re-reads."),
    (20, "useSpeedHistory(): every saved speed test result, newest first."),
    (21, "A React Query read of the saved results."),
    (29, "clear(): empty the cache at once, cancel any read in flight, and delete the saved results."),
]

USE_CAN_RUN_SPEED_TEST = [
    (5, "useCanRunSpeedTest(): yes when connected. The run-test button is disabled otherwise."),
]

USE_THROUGHPUT_SCALE = [
    (1, "useMemo, the network, scale helpers, speed history and the speed test."),
    (17, "useThroughputScale(): the Traffic chart's top value, fitted to the line as drawn."),
    (18, "Reads the network, the speed history (a React Query read), and whether a download test is running."),
    (21, "The link's top speed bounds the scale; during a download test, the last result on this network sets a floor."),
    (23, "Works it out again only when one of its inputs changes."),
]

USE_SPEED_TEST = [
    (1, "useSyncExternalStore is React's way to read a store that lives outside every component. React's own state (useState) belongs to one component and is lost when it unmounts, but a running speed test must survive you switching tabs. So the state lives in this file instead, and useSyncExternalStore tells React how to read it (a snapshot) and how to hear when it changes (subscribe)."),
    (3, "The query client (to tell the history to re-read), the backend bridge, the live traffic feed, and helpers."),
    (13, "Everything the speed test remembers: the last result, capability ratings, whether testing, progress, errors, when it finished, and live peaks."),
    (36, "What a component can read: the state plus two actions, runTest and cancelTest."),
    (37, 'runTest returns a Promise<void>: a promise, a ticket for work that finishes later. void means it carries no value; it only says "done". A caller can await it to wait for the test to end, or ignore it.'),
    (38, 'cancelTest returns nothing straight away: stopping needs no waiting.'),
    (55, 'async function: a function that can pause at each await while it waits, without freezing the app. It always hands back a promise: Promise<SpeedRunContext> means "the run\'s network context, later".'),
    (57, 'await: pause here until the backend answers with the network info, then carry on. Meanwhile the app keeps drawing and responding; only this function waits.'),
    (69, "A stop by the user isn't an error."),
    (77, "The store itself, at module level: the last result and a running test survive Home and Speed unmounting when you switch tabs."),
    (94, "The snapshot components read. It's rebuilt only when the state changes, so React can tell when to re-render."),
    (96, "Who's listening: setState updates the state and tells every listener."),
    (104, "subscribe(): add a listener; returns a way to remove it. useSyncExternalStore uses it."),
    (114, "While a test runs, track the highest live traffic rates seen."),
    (126, "A run counter, so a stopped or older run can't overwrite a newer one's results."),
    (131, "runTest(): starts a speed test (the Capabilities card's button calls it). It's async because it waits on the backend several times."),
    (140, "A new run id, and a token naming the run for the backend."),
    (144, "Mark the test as running."),
    (157, "Listen for progress from the backend and store it."),
    (166, 'Two waits at once. readRunContext() starts without await, so contextPromise is a promise still working. Then await the test itself. Both run side by side; by the time the test ends the context is long ready, and the second await takes no time. Awaiting the context first used to freeze the screen at "Starting speed test…" on slow machines.'),
    (173, 'Save the result (await: wait for the save), then tell React Query the speed history is out of date, so anything showing it re-reads. void means "start this, don\'t wait for it". This is where the live store and React Query meet.'),
    (177, "Store the result: speeds, capability ratings, the finish time. Home's Capabilities card re-renders with the new tiles."),
    (188, "On a failure: stop testing, and show an error unless the user stopped it."),
    (202, "cancelTest(): stop at once in the UI, and tell the backend to stop."),
    (220, "useSpeedTest(select): reads part of the store. useSyncExternalStore subscribes when the component mounts, reads the snapshot each render, and when a listener fires it re-reads; it re-renders only if the picked part changed. So a card reading `isTesting` doesn't re-render on every live peak."),
]

USE_LIVE_THROUGHPUT = [
    (1, "React's effect hook and useSyncExternalStore (the bridge from React to a store outside components), plus the history helpers and types."),
    (11, "What the store holds: the latest sample and the last minute of samples."),
    (18, "Empty to start."),
    (22, "The store, at module level, with one owner, so the history keeps filling while another tab is open."),
    (29, "Replace the state and tell every listener."),
    (34, "A sample arrives from the backend: clean up the rates and add it to the history."),
    (45, "When the feed stops, drop the old trace so the chart starts fresh."),
    (51, "Turning the backend's feed off waits 2 seconds, so a brief hide or a dev-mode remount doesn't flip it off and on."),
    (63, "startSource(): listen for samples and ask the backend to start sending them."),
    (73, "stopSourceNow(): stop listening, ask the backend to stop, and clear the history."),
    (82, "scheduleStopSource(): stop after the grace period, unless restarted first."),
    (95, "useLiveThroughputSource(isActive): owns the feed. NetworkProvider calls it once, high in the app, with whether the window is visible."),
    (105, "subscribeStore(): add a listener; returns a way to remove it."),
    (113, "useLiveThroughput(): reads the store, through useSyncExternalStore: subscribe with subscribeStore, read storeState. Each new sample swaps storeState for a new object and calls the listeners, so the Traffic card re-renders once a second. It doesn't start or stop the feed."),
    (118, "For code outside React (the speed test) to read and watch the feed."),
    (131, "In development, hot reload re-runs this file; this releases the old copy's listeners."),
]
