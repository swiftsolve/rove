/**
 * App icons — thin aliases over lucide-react so every glyph shares the same
 * optical size and stroke. Import these semantic names; swap the underlying
 * Lucide icon here in one place if the design changes.
 */
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Compass,
  Cpu,
  Copy,
  Download,
  EthernetPort,
  Minus,
  Play,
  RotateCw,
  Gamepad2,
  Gauge,
  Globe,
  HelpCircle,
  History,
  House,
  Joystick,
  Laptop,
  Layers,
  MonitorPlay,
  Network,
  Radio,
  Router,
  Server,
  Smartphone,
  Printer,
  Sparkles,
  Square,
  Stethoscope,
  Trash2,
  Tv,
  Video,
  Waypoints,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react'

interface IconProps {
  readonly size?: number
  readonly className?: string
}

function make(Base: LucideIcon, defaultSize: number) {
  return function Icon({ size = defaultSize, className }: IconProps): JSX.Element {
    return <Base size={size} className={className} strokeWidth={1.75} aria-hidden />
  }
}

export const WifiIcon = make(Wifi, 20)
export const EthernetIcon = make(EthernetPort, 20)
export const OfflineIcon = make(WifiOff, 20)
export const ActivityIcon = make(Activity, 18)
export const ZapIcon = make(Zap, 22)
export const ArrowDownIcon = make(ArrowDown, 16)
export const ArrowUpIcon = make(ArrowUp, 16)
export const ChevronDownIcon = make(ChevronDown, 16)
export const ChevronRightIcon = make(ChevronRight, 16)
export const ArrowLeftIcon = make(ArrowLeft, 16)
export const CheckIcon = make(Check, 16)
export const HomeIcon = make(House, 18)
export const LayersIcon = make(Layers, 18)
export const DiagnosticsIcon = make(Stethoscope, 18)
export const DeviceIcon = make(Smartphone, 18)
export const RouterIcon = make(Router, 18)
export const CloudIcon = make(Cloud, 18)
export const GlobeIcon = make(Globe, 18)
export const IpIcon = make(Network, 18)
export const GatewayIcon = make(Waypoints, 18)
export const SpeedIcon = make(Gauge, 18)
export const PulseIcon = make(Activity, 18)
export const DnsIcon = make(Server, 18)
export const SparkleIcon = make(Sparkles, 18)
export const HistoryIcon = make(History, 16)
export const UsageIcon = make(BarChart3, 18)
export const ComputerIcon = make(Laptop, 16)
export const TvIcon = make(Tv, 16)
export const PrinterIcon = make(Printer, 16)
export const ChipIcon = make(Cpu, 16)
export const UnknownDeviceIcon = make(HelpCircle, 16)
export const TrashIcon = make(Trash2, 16)
export const StopIcon = make(Square, 14)
export const PlayIcon = make(Play, 16)
export const RefreshIcon = make(RotateCw, 16)

// Window controls
export const MinimizeIcon = make(Minus, 15)
export const MaximizeIcon = make(Square, 13)
export const RestoreIcon = make(Copy, 13)
export const CloseIcon = make(X, 15)

// Capability icons
export const BrowsingIcon = make(Compass, 22)
export const HdStreamIcon = make(MonitorPlay, 22)
export const VideoCallIcon = make(Video, 22)
export const GamepadIcon = make(Gamepad2, 22)
export const CloudGamingIcon = make(Joystick, 22)
export const DownloadIcon = make(Download, 22)
export const LiveStreamIcon = make(Radio, 22)
export const GlobeStreamIcon = make(Globe, 22)
