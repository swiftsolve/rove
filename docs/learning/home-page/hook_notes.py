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
    (46, "A result counts as current for 10 seconds by default, so a quick Home → Devices swap doesn't fetch twice."),
    (48, "Turns any error into text."),
    (62, "Starts useBackendQuery: React Query's useQuery with the app's rules for opening, polling and busy states."),
    (71, "Whether it can fetch at all (is there a backend?)."),
    (74, "Remembers which key has finished its opening fetch, so later fetches count as quiet polls, not visible loads."),
    (78, "The actual React Query call:"),
    (79, "the key, the fetch function (or skipToken to fetch nothing),"),
    (81, "only while enabled; a result stays fresh for freshForMs; poll every pollIntervalMs if set;"),
    (84, "forget the data at once if asked; refetch on window focus only for polled queries;"),
    (88, "and once open, re-render only when the data or error changes, not every time a background poll starts or stops."),
    (90, "Takes what's needed from React Query's result."),
    (93, "Notes when the opening fetch is over."),
    (97, "Counts manual reloads in flight, so this screen can show them as busy."),
    (98, 'reload(): fetch now and show the busy state. Count one more reload, await the refetch, and in finally count it back down, even if the fetch failed, so busy never gets stuck on.'),
    (108, 'refresh(): fetch now without the busy state, joining any fetch already running. For an update nobody clicked for. Both are async, so a caller can await them.'),
    (112, "isBusy is true for the opening fetch or a manual reload, never a background poll. The error is hidden during the opening fetch, so an old error doesn't flash up."),
    (116, "Hands everything back to the caller."),
]

NETWORK_PROVIDER = [
    (3, "The three contexts it fills, and the helpers that produce their values."),
    (12, "NetworkProvider sits near the top of the app and owns all network state. Each value has its own context, so a component re-renders only when the value it reads changes."),
    (17, "Starts the provider."),
    (21, "Reads the network info (a React Query poll, see useNetworkInfoSource) and whether the internet is reachable."),
    (25, "Works out the title bar's verdict (\"Online\", \"No internet\", \"Offline\"…) from the two, and keeps the same object until the verdict changes."),
    (29, "Starts the live traffic feed for the whole app, paused only while the window is hidden, so Home's chart is already full when you come back."),
    (33, "Provides all three values to everything inside: useNetwork(), useInternetStatus() and useConnectionStatus() read them."),
]

USE_NETWORK_INFO_SOURCE = [
    (1, "Uses React Query's useQuery directly, plus React's state and effect hooks."),
    (4, "The shared query client, the bridge to the backend, an equality check, and hooks for the backend's network-changed nudge and window visibility."),
    (11, "The cache key for network info."),
    (13, "Poll every 15 seconds, time out a read after 20, and only show an error after 3 failures in a row, keeping the last good reading on screen until then."),
    (30, "The kinds of error: timeout (the OS is slow), backend (no backend at all), offline (the read failed)."),
    (36, "What every component reading the network gets: the info, an error, when it was last read, whether it's loading, and a refresh function."),
    (49, "Wraps a read so it fails with a timeout error if it takes too long."),
    (67, "The actual read: ask the backend for network info, with the 20-second timeout."),
    (71, "Turns an error into one of the kinds above."),
    (83, "Starts the hook. NetworkProvider calls it once; everything else reads its result through useNetwork()."),
    (85, "Is there a backend? Not in a plain web build or a test."),
    (86, "The React Query call: the network-info key, the read, only with a backend, polling every 15 seconds,"),
    (94, "retrying a failed read a few times, a poll apart, but only once there's a good reading to keep showing,"),
    (98, "keeping the old object when nothing changed, so components don't re-render for an identical reading,"),
    (103, "and re-rendering only for data, error or status changes."),
    (105, "Takes what's needed from the result."),
    (110, "Manual reloads in flight (Retry, or the window coming back), shown as loading until the first reading."),
    (111, "reload(): drop any read in flight and read afresh."),
    (124, "When the window comes back after being hidden, read afresh."),
    (134, "When the backend says the network changed, read again right away."),
    (136, "Shapes the result: the info (or null), the error, when it was last read (only while there's an error), and loading."),
    (144, "Hands back one stable object, rebuilt only when one of its values changes."),
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

USE_DETAILS_EXPANDED = [
    (1, "useSetting: a value saved in Rove's settings."),
    (4, "The old place this choice was saved, still read so an open card stays open after the update."),
    (18, "useDetailsExpanded(): whether the network card's details are open, saved as a setting so it survives tab switches and restarts. Returns the value and a toggle."),
]

USE_DATA_USAGE = [
    (1, "The shared usage-query helper."),
    (8, "Poll every 2 seconds, so today's total climbs as data moves."),
    (10, "What to show before the first answer: no days, zero totals."),
    (13, "useDataUsage(): the last week's data use, per day. The Usage card picks today out of it. It's a React Query read under the hood (see useUsageQuery)."),
]

USE_USAGE_QUERY = [
    (3, "Built on the shared React Query wrapper."),
    (10, "Poll every 5 seconds by default, or every 15 when the backend pushes updates."),
    (14, "Its options: the cache key, the read, an empty value, an error message, an emptiness check, a poll interval, and an optional push subscription."),
    (35, "What it gives back: the usage (never undefined), loading flags, an error and reload."),
    (52, "Starts the helper."),
    (61, "The read, if there's a backend."),
    (64, "The React Query read: always enabled while mounted, polling at the interval."),
    (73, "If the backend pushes \"new data\", re-read quietly right away."),
    (79, "No backend: a clear error rather than a spinner forever."),
    (83, "The data, or the empty value before it arrives, plus a first-load flag for a spinner."),
]

USE_DEVICES = [
    (1, "Navigation, the network state and its key, a check for the desktop app, a nudge for the events feed, the shared React Query wrapper, and which platform this is."),
    (10, 'What the hook gives back: whether Home may scan by itself, the last scan, whether scanning, any error, and rescan, which returns a promise that settles when the scan is done.'),
    (19, 'scanDevices is async: it returns Promise<LanDeviceScan>, the scan, later.'),
    (20, "try / finally: return await waits for the backend's scan and hands it back; finally runs afterwards whether the scan worked or failed, nudging the events feed, since a scan can create events. Without await, finally would run before the scan ended."),
    (32, "useDevices(): the device scan, shared by the Devices tab, the Home card and Events through one cache entry per network."),
    (35, "The current network's key, for the cache key."),
    (37, "Whether you're on a network: off one there's nothing to scan."),
    (43, "In the macOS app, Home never scans by itself: scanning asks for a permission, which should come from opening Devices or pressing Discover. The demo on the website has no prompt, so it scans."),
    (44, "Scan when Devices is open, or on Home where that's allowed."),
    (50, "The React Query read: keyed by network, so a new network rescans; only while connected; no polling, because a scan is heavy."),
    (57, "Hands back the scan, its state and rescan (React Query's reload)."),
]

USE_CAN_RUN_SPEED_TEST = [
    (5, "useCanRunSpeedTest(): yes when connected. The run-test button is disabled otherwise."),
]

USE_THROUGHPUT_SCALE = [
    (1, "useMemo, the network, the scale helpers, and the link's top speed."),
    (13, "useThroughputScale(): the Traffic chart's top value, fitted to the line as drawn."),
    (14, "Reads the network info."),
    (15, "The link's top speed, which bounds the scale."),
    (16, "Works it out again only when one of its inputs changes."),
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
    (79, "The store itself, at module level: the last result and a running test survive Home and Speed unmounting when you switch tabs."),
    (98, "The snapshot components read. It's rebuilt only when the state changes, so React can tell when to re-render."),
    (100, "Who's listening: setState updates the state and tells every listener."),
    (108, "subscribe(): add a listener; returns a way to remove it. useSyncExternalStore uses it."),
    (118, "While a test runs, track the highest live traffic rates seen."),
    (132, "A run counter, so a stopped or older run can't overwrite a newer one's results."),
    (139, "runTest(): starts a speed test (the Capabilities card's button calls it). It's async because it waits on the backend several times."),
    (148, "A new run id, and a token naming the run for the backend."),
    (152, "Mark the test as running."),
    (165, "Listen for progress from the backend and store it."),
    (174, 'Two waits at once. readRunContext() starts without await, so contextPromise is a promise still working. Then await the test itself. Both run side by side; by the time the test ends the context is long ready, and the second await takes no time. Awaiting the context first used to freeze the screen at "Starting speed test…" on slow machines.'),
    (181, 'Save the result (await: wait for the save), then tell React Query the speed history is out of date, so anything showing it re-reads. void means "start this, don\'t wait for it". This is where the live store and React Query meet.'),
    (185, "Store the result: speeds, capability ratings, the finish time. Home's Capabilities card re-renders with the new tiles."),
    (196, "On a failure: stop testing, and show an error unless the user stopped it."),
    (210, "cancelTest(): stop at once in the UI, and tell the backend to stop."),
    (228, "useSpeedTest(select): reads part of the store. useSyncExternalStore subscribes when the component mounts, reads the snapshot each render, and when a listener fires it re-reads; it re-renders only if the picked part changed. So a card reading `isTesting` doesn't re-render on every live peak."),
]

USE_LIVE_THROUGHPUT = [
    (1, "React's effect hook and useSyncExternalStore (the bridge from React to a store outside components), plus the history helpers and types."),
    (11, "What the store holds: the latest sample and the last minute of samples."),
    (18, "Empty to start."),
    (28, "The store, at module level, with one owner, so the history keeps filling while another tab is open."),
    (31, "Replace the state and tell every listener."),
    (36, "A sample arrives from the backend: clean up the rates and add it to the history."),
    (50, "When the feed stops, drop the old trace so the chart starts fresh."),
    (58, "Turning the backend's feed off waits 2 seconds, so a brief hide or a dev-mode remount doesn't flip it off and on."),
    (69, "startSource(): listen for samples and ask the backend to start sending them."),
    (79, "stopSourceNow(): stop listening, ask the backend to stop, and clear the history."),
    (88, "scheduleStopSource(): stop after the grace period, unless restarted first."),
    (101, "useLiveThroughputSource(isActive): owns the feed. NetworkProvider calls it once, high in the app, with whether the window is visible."),
    (111, "subscribeStore(): add a listener; returns a way to remove it."),
    (119, "useLiveThroughput(): reads the store, through useSyncExternalStore: subscribe with subscribeStore, read storeState. Each new sample swaps storeState for a new object and calls the listeners, so the Traffic card re-renders once a second. It doesn't start or stop the feed."),
    (124, "For code outside React (the speed test) to read and watch the feed."),
    (137, "In development, hot reload re-runs this file; this releases the old copy's listeners."),
]
