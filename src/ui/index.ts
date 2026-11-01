// The library's public API: features import from `@/ui`, never a path inside it.
// Grouped by what a component is for; the folders under `src/ui` are flat.

// Actions
export { Button, type ButtonAppearance, type ButtonProps } from './button/Button'
export { IconButton } from './button/IconButton'
export { StretchedButton } from './button/StretchedButton'
export { Link } from './link/Link'
export { ViewLink } from './link/ViewLink'
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
export { ErrorBanner, POLLING_DESCRIPTION } from './error-banner/ErrorBanner'
export { EmptyState, EmptyStateDescription } from './empty-state/EmptyState'

// Data display
export { DataList, DataListStack, DataRow } from './data-list/DataList'
export { Readout, ReadoutValue } from './readout/Readout'
export { MetricValue, type MetricStatus } from './metric-value/MetricValue'
export { BarMeter } from './bar-meter/BarMeter'
export { ListRow } from './list-row/ListRow'
export { IconTile, IconTileButton } from './icon-tile/IconTile'

// Containers
export { Card, CardBody, CardFooter, CardHeader } from './card/Card'
export { Disclosure, DisclosurePanel, DisclosureTrigger } from './disclosure/Disclosure'
export { DotSeparator, InlineMeta } from './separator/DotSeparator'

// App frame
export { TitleBar, TitleBarStatus, WindowButton } from './title-bar/TitleBar'
export { NavItem, NavRail } from './nav-rail/NavRail'
export { PageHeader } from './page-header/PageHeader'

export * from './icons/Icons'
export { DirectionIcon, type SpeedSeries } from './icons/DirectionIcon'

export { cn } from './foundations/cn'
export { useCountUp } from './hooks/useCountUp'
export { useLatestRef } from './hooks/useLatestRef'
export { usePresence } from './hooks/usePresence'
export { usePortalContainer } from './hooks/usePortalContainer'
export { PortalProvider } from './context/PortalProvider'
