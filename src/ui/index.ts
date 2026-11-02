// The library's public API: features import from `@/ui`, never a path inside it.
// Grouped by what a component is for; the folders under `src/ui` are flat.

// Actions
export { Button, type ButtonAppearance, type ButtonProps } from './button/Button'
export { IconButton } from './button/IconButton'
export { Link } from './link/Link'
export { StretchedLink } from './link/StretchedLink'
export { Menu, MenuContent, MenuItem, MenuTrigger } from './menu/Menu'

// Inputs
export { TextField, TextFieldAction } from './text-field/TextField'
export { Toggle } from './toggle/Toggle'
export { SegmentedControl, type SegmentedOption } from './segmented-control/SegmentedControl'

// Overlays
export { Dialog, DialogRoot } from './dialog/Dialog'
export { Tooltip } from './tooltip/Tooltip'

// Status and feedback
export { Badge, LiveBadge } from './badge/Badge'
export { StatusDot } from './status-dot/StatusDot'
export { Spinner } from './spinner/Spinner'
export { ButtonSpinner } from './spinner/ButtonSpinner'
export { LoadingState } from './loading-state/LoadingState'
export { Banner, POLLING_DESCRIPTION } from './banner/Banner'
export { EmptyState, EmptyStateDescription } from './empty-state/EmptyState'

// Data display
export { DataList, DataListStack, DataRow } from './data-list/DataList'
export { Readout } from './readout/Readout'
export { MetricValue, type MetricStatus } from './metric-value/MetricValue'
export { BarMeter } from './bar-meter/BarMeter'
export { SplitBar } from './split-bar/SplitBar'
export { ListRow } from './list-row/ListRow'
export { IconTile, IconTileButton, type IconTileColor } from './icon-tile/IconTile'
export { TimelineNode, type TimelineNodeColor } from './timeline/TimelineNode'

// Containers
export { Card, CardBody, CardFooter, CardHeader, CardList, focusCardLink } from './card/Card'
export { Collapsible, CollapsiblePanel, CollapsibleTrigger } from './collapsible/Collapsible'
export { DotSeparator, InlineMeta } from './separator/DotSeparator'

// App frame
export { TitleBar, TitleBarStatus, WindowButton } from './title-bar/TitleBar'
export { NavItem, NavRail } from './nav-rail/NavRail'
export { PageHeader } from './page-header/PageHeader'

export * from './icons/Icons'
export { DirectionIcon, type SpeedSeries } from './icons/DirectionIcon'

export { cn } from './foundations/cn'
export type { VariantOf } from './foundations/variants'
export { useCountUp } from './hooks/useCountUp'
export { useLatestRef } from './hooks/useLatestRef'
export { usePresence } from './hooks/usePresence'
export { usePortalContainer } from './hooks/usePortalContainer'
export { PortalProvider } from './context/PortalProvider'

export { UI_LIBRARY_VERSION } from './version'
