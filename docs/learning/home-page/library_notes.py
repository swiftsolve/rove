CARD = [
    (1, "The recipe maker for the card's look, and React pieces: prop types and useId."),
    (4, "The invisible full-card link, the class joiner, and the provider that shares what the card knows with its header."),
    (8, "Card's props: which HTML element to be, what clicking the card does, the link's spoken name, layout classes, and the content."),
    (34, "The card's look: a rounded surface that clips its content. An openable card also lifts on hover and dips 1px when pressed."),
    (52, "Starts Card. `as: Element = 'section'` means it renders a <section> unless told otherwise."),
    (53, "A unique id for the title, so the card can be named by it."),
    (54, "The card is openable when it's given something to do on a click."),
    (56, "CardProvider shares the title id and openable flag with whatever is inside (the CardHeader)."),
    (57, "The card element: its classes, its name for screen readers (its title), and a marker other code can find."),
    (66, "An openable card puts an invisible link over its whole area, so a click anywhere opens it. It comes first so it's first in Tab order."),
    (69, "Whatever was put inside the card."),
    (80, "Moves keyboard focus to the card's link: for a button inside the card that's about to disappear (Devices' Discover), so focus isn't lost."),
]
CARD_CONTEXT = [
    (1, "createContext makes a context: a value shared with everything inside a provider."),
    (4, "What a Card shares with its header: the id for the title, and whether the card opens something."),
    (11, "The context itself, with a default for a CardHeader used outside any Card: not openable. CardProvider gives it the real value; useCardContext reads it."),
]
CARD_HEADER = [
    (1, "Class joining, and React's prop types."),
    (4, "The caret icon, the class joiner, and useCardContext, which reads what the Card around it knows."),
    (9, "The header row's layout: a fixed height, title on the left, actions on the right."),
    (15, "The caret on an openable card: grey, brighter when the card is hovered or its link focused."),
    (20, "CardHeader's props: the title, an optional icon before it, and optional actions after it."),
    (30, "Starts CardHeader."),
    (31, "Reads the title id and openable flag from the Card around it, through useCardContext()."),
    (34, "The icon and title, side by side. The icon is hidden from screen readers; the title names the card."),
    (45, "The title, nudged down 0.75px so it lines up visually with its icon."),
    (49, "On the right: the actions (like the Live badge or a button), raised above the card's link, then a caret if the card opens something."),
]
CARD_BODY = [
    (1, "The recipe maker, prop types, the class joiner, and the helper that turns a recipe option into a prop type."),
    (13, "CardBody's padding recipe: `default` pads all round with a little less on top; `rows` for rows with their own padding, tighter above a footer; `flush` for full-width lists."),
    (24, "CardBody's props: which layout, and the content."),
    (36, "Starts CardBody: a div with the chosen padding around its content."),
]
CARD_FOOTER = [
    (1, "Prop types and the class joiner."),
    (5, "CardFooter's props: just its content."),
    (11, "CardFooter: a sunken grey band at the bottom with 12px of padding. It marks itself `data-card-footer` so the body above can tighten. Home's Capabilities card builds its own instead."),
]

COLLAPSIBLE = [
    (1, "Base UI's collapsible, which handles the accessibility (aria-expanded and so on); Rove wraps it with its own styles."),
    (7, "Collapsible's props: whether it's open, what to call when it's toggled, which element to be, and whether to ring the whole thing on keyboard focus."),
    (24, "The focus frame: when the trigger has keyboard focus, draw the ring around the whole collapsible, not just the trigger."),
    (32, "Starts Collapsible."),
    (42, "Base UI's root, given the open state and the toggle callback, rendered as a <div> (or an <li> in a list)."),
]
COLLAPSIBLE_TRIGGER = [
    (1, "Base UI's collapsible, and the button's prop types."),
    (8, "The button that opens and closes it. Base UI adds aria-expanded, so screen readers know whether it's open. It marks itself `data-collapsible-trigger` so the Collapsible can draw the focus frame."),
]
COLLAPSIBLE_PANEL = [
    (1, "Base UI's collapsible, class joining, prop types, and the class joiner that lets a caller's classes win."),
    (7, "The panel's look: its height animates between 0 and its content's height."),
    (25, "The panel that opens and closes. While closed it's taken out of the page and hidden from screen readers."),
]

DATA_LIST = [
    (1, "The recipe maker, React's types, the class joiner and the variant type helper."),
    (12, "The list's row spacing, set as a CSS variable its rows read: 8px normally, 4px for `compact`."),
    (22, "DataList's props: its density, layout classes, and the rows."),
    (35, "DataList is a <dl>, HTML's list of terms and descriptions, so a screen reader reads each label with its value."),
]
DATA_ROW = [
    (1, "The recipe maker, React's types, and the variant type helper."),
    (10, "A row's layout: label left, value right. The first and last rows sit flush, so the padding only adds space between rows."),
    (17, "Label text: medium weight, tertiary grey. Value text: body, primary colour, tabular digits, right-aligned."),
    (20, "DataRow's props: alignment, the label, the value as text, or children for a value that isn't plain text (a badge, signal bars)."),
    (32, "Starts DataRow."),
    (34, "No value and no children: draw nothing. `== null`, so a real 0 still shows."),
    (36, "The row: the label in a <dt>, the value in a <dd>."),
]
ICON_TILE = [
    (1, "The recipe helper, and React types for props, styles and click handlers."),
    (4, "The class joiner, the shared press behaviour for buttons, the tint helper, and the variant type helper."),
    (9, "The tile's look: a rounded square in three sizes. A colour washes the tile in a faint tint of that colour; `neutral` uses the sunken grey instead."),
    (19, "The colours a tile accepts: any CSS colour, or `neutral`."),
    (21, "The props both tiles share: size, colour, layout classes, and the icon."),
    (37, "Works out a tile's classes and the style that sets its colour."),
    (41, "IconTile's props: the shared ones plus any normal <span> props, so a Tooltip can wrap it."),
    (47, "Starts IconTile: a <span> with the tile's look and the icon inside. Home uses it for the network icon and the grey capability tiles."),
    (56, "IconTileButton's props: the shared ones plus a label for screen readers, a click handler, and whether it's disabled."),
    (67, "Starts IconTileButton, the clickable tile: Home's rated capability tiles."),
    (80, "A real <button>. On hover or keyboard focus the tint deepens and the tile lifts 2px and grows 6%. `usable:` means only while it's not disabled."),
    (97, "Its name for screen readers, since an icon says nothing."),
    (98, "The shared press behaviour: ignores clicks while disabled, but stays focusable."),
]

DOT_SEPARATOR = [
    (10, "DotSeparator: a 3px round grey dot, hidden from screen readers."),
    (14, "The row's look: items 6px apart, either wrapping or kept on one line."),
    (21, "Each item can shrink and, on one line, end with \"…\" when there's no room."),
    (27, "InlineMeta's props: the items, layout classes, and whether to keep them on one line."),
    (40, "Starts InlineMeta: the dot-separated line in the network card (\"84% • 1.2 Gbps • 5 GHz\")."),
    (42, "Drops empty items (nothing, false, or ''), but keeps a 0."),
    (43, "Nothing left: draw nothing. One item: just that item, no dots."),
    (48, "Two or more: each item, with a dot before every item but the first."),
]

NO_VALUE = [
    (1, "NoValue's one prop: what a screen reader says in its place, \"None\" unless told otherwise."),
    (11, "Starts NoValue: a short drawn bar where a value would be, never a typed dash."),
    (13, "The bar: 0.6em wide, so it scales with the text around it, and a hairline tall."),
    (18, "The words only screen readers hear."),
]

READOUT = [
    (7, "The figure's look: large, or `compact` for the small cards."),
    (14, "The number's text style: Display (big) for large, Stat (smaller) for compact."),
    (21, "The parts of a figure: the number, its unit, and optionally what a screen reader should say instead."),
    (33, "Draws the number and its unit. While the number animates, the visible digits are hidden from screen readers and the settled value is read instead."),
    (48, "Readout's props: the figure parts, plus an optional label, icon, size and layout classes."),
    (64, "Starts Readout. The Traffic card's speeds and the small cards' figures are Readouts."),
    (66, "No label (the small cards): the icon sits inline before the figure."),
    (74, "With a label (Traffic): the icon and label in a <dt>, the figure in a <dd>, so the pair reads as a term and its value."),
]

BAR_METER = [
    (3, "Reads the screen's pixel density, so the bars can snap to whole screen pixels."),
    (14, "Bar sizes: 2px wide, 2 to 8px tall, 2px apart. The comment explains why they're drawn as an SVG snapped to screen pixels: plain boxes looked jagged at 125% or 150% scaling."),
    (19, "How each bar is filled: lit in the full colour, unlit in a faint tint of it, or two greys when dimmed."),
    (35, "Picks a bar's fill from whether it's lit and whether the meter is dimmed."),
    (40, "BarMeter's props: how many bars are lit (0–4), the colour, whether it's dimmed, and layout classes."),
    (55, "Starts BarMeter. The signal bars in the network card are a BarMeter."),
    (56, "Turns every size into whole screen pixels, so all bars are equally wide and none sits between pixels."),
    (66, "The SVG: drawn in screen pixels, then shown at the right CSS size. Hidden from screen readers; whatever holds it says the value."),
    (74, "The four bars, bottom-aligned, rounded at the ends, each lit or not."),
]

STATUS_DOT = [
    (7, "The dot's look: 5px and round, in the text colour, green, or the accent, with an optional pulse at one of three speeds."),
    (23, "StatusDot's props: its tone, its pulse, and layout classes."),
    (44, "Starts StatusDot: a decorative dot, hidden from screen readers because the words beside it carry the meaning. The \"online\" dot and the Live badge's dot are StatusDots."),
]

DIRECTION_ICON = [
    (4, "The two arrow icons."),
    (6, "The colour: the download series blue, or the upload series purple."),
    (13, "The type for the two directions, used across the app."),
    (25, "Starts DirectionIcon: a down arrow for download, an up arrow for upload, in their colours. The arrow's shape carries the meaning as well as its colour."),
]

BUTTON = [
    (10, "The button's look: rounded, with a press dip and state styles shared by every button."),
    (19, "Two variants: solid (a filled button with a white label, a page's main action) and soft (a quiet grey chip, everything else)."),
    (26, "Two sizes, each with its text style and padding."),
    (31, "The colour for each variant and tone pair, like soft and neutral: a sunken grey that lightens on hover."),
    (58, "The allowed combinations: solid is accent or negative; soft is neutral or negative."),
    (90, "Each variant's tones and default size."),
    (94, "Every icon in a button is 13px."),
    (96, "Button's props: its look, label, click handler, icon, and whether it's disabled or loading."),
    (116, "Starts Button. Devices' Discover button is a Button."),
    (130, "Picks the label to show, and a tone that fits the variant."),
    (134, "A real <button> with its classes and the shared press behaviour. While loading, a spinner takes the icon's place."),
]

ICON_BUTTON = [
    (11, "The look: a 28px rounded square, secondary grey, lighter on hover; `soft` adds the sunken grey fill."),
    (32, "IconButton's props: a label (it has no visible text), the icon, variant, icon size, tooltip, and the disabled and loading states."),
    (57, "Starts IconButton. The Capabilities card's run-test button is one."),
    (72, "Wrapped in a Tooltip that shows the label (or a longer tooltip) on hover and keyboard focus."),
    (73, "The <button>: named by its label, with the shared press behaviour. While loading, a spinner replaces the icon."),
]

BUTTON_SPINNER = [
    (1, "A spinner sized and coloured to sit inside a button, drawn as an SVG because a <div> isn't allowed inside a <button>."),
    (6, "Its props: size in pixels, and colour (the button's text colour by default)."),
    (15, "Works out the ring's geometry from the size."),
    (19, "The SVG rotates, hidden from screen readers."),
    (29, "A faint full ring underneath."),
    (30, "The bright arc on top, which grows and shrinks as it turns."),
]

LINK = [
    (13, "The link's look: secondary grey text the size of the line around it, accent and underlined on hover or focus. Its padding hangs outside the text, so it adds no height to its line."),
    (28, "The icons are a touch dimmer at rest and brighten with the link."),
    (38, "Only the words underline, not the icons."),
    (44, "Every icon in a link is 13px."),
    (46, "The two kinds of link: one that opens a view in the app (onClick), or one that opens a web address (href)."),
    (76, "Starts Link."),
    (77, "With an address: an <a> that opens a new window, ends in an ↗ arrow, and tells screen readers it opens a new window."),
    (88, "Without one: a <button> that screen readers hear as a link, since it moves you somewhere. It ends in a caret. Home's Speed test link is this kind."),
]

BADGE = [
    (8, "A tinted flag in green, amber or red. Home doesn't use Badge itself."),
    (40, "LiveDot: the badge's pulsing dot. A new key on each update restarts its breath, and it starts as far in as the update is old, so a dot that mounts between updates stays in step."),
    (47, "LiveBadge: a dark pill with a pulsing green dot and the word \"Live\". updatedAt is when the last sample came. The Traffic card's header shows one."),
]

SCREEN_READER_STATUS = [
    (11, "A line only screen readers hear, read out each time its text changes. role=\"status\" is what makes it announced. It stays mounted, because a region that appears already holding text often isn't read."),
]

TOOLTIP = [
    (1, "Base UI's tooltip handles the hover and focus timing and the positioning; Rove styles it."),
    (9, "The bubble's look: small text on the popover background with a border and shadow. It fades in from 3px above, and the pointer passes through it."),
    (19, "It keeps 8px from the window's edges."),
    (24, "Tooltip's props: the content, the trigger element, which side, the gap, whether it's off, whether it describes the trigger to screen readers, and its maximum width."),
    (60, "Starts Tooltip."),
    (69, "An id for the hidden description screen readers read."),
    (70, "Works out whether to describe the trigger: not when off, not when told not to, and not when the content just repeats the trigger's own name."),
    (76, "If the trigger already has a description, joins the two."),
    (82, "Base UI's root and trigger: opens immediately on hover or focus."),
    (90, "A hidden copy of the content that the trigger's description points at, so screen readers hear it."),
    (97, "The visible bubble, placed in a layer above everything (a portal), so a card's clipping can't cut it off. It flips side or slides to stay in the window."),
]

USE_COUNT_UP = [
    (3, "How fast it eases: each frame covers 18% of the remaining distance. Within 0.05 it snaps to the target."),
    (8, "The system setting for people who prefer less motion."),
    (16, "Starts useCountUp: given a target number, returns a number that eases toward it frame by frame. The Traffic card's speeds use it."),
    (17, "The displayed value, and where it currently is."),
    (20, "Each time the target changes, run a loop on the screen's frames."),
    (23, "How far there is still to go."),
    (26, "Snap straight to the target if the gap is broken (not a number), tiny, or the person prefers reduced motion."),
    (33, "Otherwise, move 18% of the way, show it, and do it again next frame."),
    (38, "Stops the loop if the target changes again or the component goes away."),
]

USE_ROVING_FOCUS = [
    (3, "Its options: which elements are the items, which arrow keys move between them, and which item Tab lands on first."),
    (12, "Which key means next and previous, for each direction."),
    (16, "Works out which item a key moves to, wrapping at the ends; Home and End jump to the first and last."),
    (38, "Starts useRovingFocus: makes a group of items one Tab stop, moved through with the arrow keys. The capability tiles use it."),
    (42, "Sets everything up once the group is on the page."),
    (46, "Finds the items, and makes exactly one of them reachable with Tab."),
    (50, "Puts the Tab stop back on the current item (or the first) when focus leaves the group."),
    (55, "On an arrow, Home or End: move focus to the right item and make it the Tab stop."),
    (68, "However an item gets focus (a click too), it becomes the Tab stop."),
    (72, "When focus leaves the group, reset the Tab stop."),
    (76, "Starts listening for keys and focus changes."),
    (81, "Watches for items appearing or changing, and keeps the Tab stop right."),
    (85, "Stops listening when the group goes away."),
]
