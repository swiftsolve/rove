// The library's public API: features import from `@/ui`, never a path inside it.
// Grouped by what a component is for; the folders under `src/ui` are flat.

// Actions
export { Button } from './button/Button'
export { IconButton } from './button/IconButton'
export { Link } from './link/Link'
export { StretchedLink } from './link/StretchedLink'
export { Menu } from './menu/Menu'
export { MenuContent } from './menu/components/MenuContent'
export { MenuItem } from './menu/components/MenuItem'
export { MenuTrigger } from './menu/components/MenuTrigger'

// Inputs
export { TextField } from './text-field/TextField'
export { TextFieldAction } from './text-field/components/TextFieldAction'
export { Toggle } from './toggle/Toggle'
export { SegmentedControl, type SegmentedOption } from './segmented-control/SegmentedControl'

// Overlays
export { Dialog } from './dialog/Dialog'
export { DialogRoot } from './dialog/context/DialogRoot'
export { Tooltip } from './tooltip/Tooltip'

// Status and feedback
export { Badge, LiveBadge } from './badge/Badge'
export { StatusDot } from './status-dot/StatusDot'
export { Spinner } from './spinner/Spinner'
export { ButtonSpinner } from './spinner/ButtonSpinner'
export { LoadingState } from './loading-state/LoadingState'
export { Banner } from './banner/Banner'
export { EmptyState } from './empty-state/EmptyState'
export { EmptyStateDescription } from './empty-state/components/EmptyStateDescription'

// Data display
export { DataList } from './data-list/DataList'
export { DataListStack } from './data-list/components/DataListStack'
export { DataRow } from './data-list/components/DataRow'
export { NoValue } from './no-value/NoValue'
export { Readout } from './readout/Readout'
export { MetricValue, type MetricStatus } from './metric-value/MetricValue'
export { BarMeter } from './bar-meter/BarMeter'
export { SplitBar } from './split-bar/SplitBar'
export { ListRow } from './list-row/ListRow'
export { IconTile, IconTileButton, type IconTileColor } from './icon-tile/IconTile'
export { TimelineNode, type TimelineNodeColor } from './timeline/TimelineNode'

// Containers
export { Card, focusCardLink } from './card/Card'
export { CardBody } from './card/components/CardBody'
export { CardFooter } from './card/components/CardFooter'
export { CardHeader } from './card/components/CardHeader'
export { CardList } from './card/components/CardList'
export { Collapsible } from './collapsible/Collapsible'
export { CollapsiblePanel } from './collapsible/components/CollapsiblePanel'
export { CollapsibleTrigger } from './collapsible/components/CollapsibleTrigger'
export { DotSeparator, InlineMeta } from './separator/DotSeparator'

// App frame
export { TitleBar } from './title-bar/TitleBar'
export { TitleBarStatus } from './title-bar/components/TitleBarStatus'
export { WindowButton } from './title-bar/components/WindowButton'
export { NavItem } from './nav-rail/components/NavItem'
export { NavRail } from './nav-rail/NavRail'
export { PageHeader } from './page-header/PageHeader'

// Accessibility
export { ScreenReaderStatus } from './screen-reader/ScreenReaderStatus'
export { SpokenText } from './screen-reader/SpokenText'

export * from './icons/Icons'
export { BrandIcon } from './icons/BrandIcon'
export { CloudGamingIcon } from './icons/CloudGamingIcon'
export { ConnectionIcon } from './icons/ConnectionIcon'
export { HdStreamIcon } from './icons/HdStreamIcon'
export { PathIcon } from './icons/PathIcon'
export { SmartHomeIcon } from './icons/SmartHomeIcon'
export { UltraHdStreamIcon } from './icons/UltraHdStreamIcon'
export { DirectionIcon, type SpeedSeries } from './icons/DirectionIcon'

export { cn } from './utils/cn'
export { STATUS_TEXT } from './utils/status'
export type { VariantOf } from './utils/variants'
export { useCountUp } from './hooks/useCountUp'
export { useLatestRef } from './hooks/useLatestRef'
export { usePresence } from './hooks/usePresence'
export { useRovingFocus } from './hooks/useRovingFocus'
export { moveFocusBetweenRows } from './utils/row-arrow-keys'
export { PortalProvider } from './context/PortalProvider'
