/**
 * App icons — thin aliases over lucide-react so every glyph shares the same
 * optical size and stroke. Import these semantic names; swap the underlying
 * Lucide icon here in one place if the design changes.
 */
import { useId } from 'react'
import type { LucideIcon } from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import { FourKIcon, HdIcon } from '@hugeicons/core-free-icons'
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bell,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronRight,
  Cctv,
  Clock,
  Cloud,
  Compass,
  Cpu,
  Copy,
  Database,
  Download,
  EthernetPort,
  FolderSync,
  HardDrive,
  Minus,
  MonitorSmartphone,
  MoreHorizontal,
  Play,
  // MonitorPlay dropped in favour of Tabler's dedicated HD/4K badge glyphs
  RotateCw,
  Gamepad2,
  Gauge,
  Globe,
  GlobeOff,
  HelpCircle,
  History,
  House,
  Info,
  Joystick,
  Laptop,
  LayoutGrid,
  Layers,
  Mail,
  MessageSquare,
  Moon,
  Network,
  Pencil,
  Plus,
  Radio,
  Router,
  Search,
  Server,
  Settings,
  Share2,
  ShieldAlert,
  Smartphone,
  Speaker,
  Printer,
  Tag,
  Terminal,
  TextSearch,
  QrCode,
  Sparkles,
  Square,
  Stethoscope,
  Sun,
  Tablet,
  TriangleAlert,
  Trash2,
  Tv,
  Video,
  Watch,
  Waypoints,
  Wifi,
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

// Hugeicons equivalent of `make` — Hugeicons ship as SVG data rendered through
// the shared <HugeiconsIcon> component. They're drawn on the same 24-grid as the
// Lucide aliases but at a native 1.5 stroke, which we keep here for the enclosed
// HD/4K badge glyphs.
function makeHuge(icon: IconSvgElement, defaultSize: number) {
  return function Icon({ size = defaultSize, className }: IconProps): JSX.Element {
    return (
      <HugeiconsIcon icon={icon} size={size} strokeWidth={1.5} className={className} aria-hidden />
    )
  }
}

export const WifiIcon = make(Wifi, 20)

/**
 * The Rove Mark — a filled centre dot inside an open ring. By default it's drawn
 * in `currentColor` (fill + stroke) so it inherits the accent color from its
 * container, matching the tray glyph. Pass `gradient` for the app-icon treatment
 * — the same top-to-bottom blue the 1024px dock icon uses. This is the one brand
 * glyph that isn't a Lucide alias.
 */
export function BrandIcon({
  size = 20,
  className,
  gradient = false,
}: IconProps & { readonly gradient?: boolean }): JSX.Element {
  const gid = useId()
  const paint = gradient ? `url(#${gid})` : 'currentColor'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
      {gradient && (
        <defs>
          <linearGradient id={gid} x1="24" y1="7" x2="24" y2="41" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7aa4ff" />
            <stop offset="1" stopColor="#5484f5" />
          </linearGradient>
        </defs>
      )}
      <circle cx="24" cy="24" r="7.5" fill={paint} />
      <path
        d="M 11.98 36.02 A 17 17 0 1 1 36.02 36.02"
        fill="none"
        stroke={paint}
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  )
}
export const EthernetIcon = make(EthernetPort, 20)
export const OfflineIcon = make(GlobeOff, 20)
export const ActivityIcon = make(Activity, 18)
export const EventsIcon = make(TextSearch, 18)
export const ZapIcon = make(Zap, 22)
export const ArrowDownIcon = make(ArrowDown, 16)
export const ArrowUpIcon = make(ArrowUp, 16)
export const ArrowRightIcon = make(ArrowRight, 16)
export const ChevronDownIcon = make(ChevronDown, 16)
export const ChevronRightIcon = make(ChevronRight, 16)
export const ArrowLeftIcon = make(ArrowLeft, 16)
export const CheckIcon = make(Check, 16)
export const HomeIcon = make(House, 18)
export const LayersIcon = make(Layers, 18)
export const AppsIcon = make(LayoutGrid, 18)
export const DiagnosticsIcon = make(Stethoscope, 18)
export const DeviceIcon = make(Smartphone, 18)
export const DevicesIcon = make(MonitorSmartphone, 18)
export const RouterIcon = make(Router, 18)
export const CloudIcon = make(Cloud, 18)
export const GlobeIcon = make(Globe, 18)
export const IpIcon = make(Network, 18)
export const GatewayIcon = make(Waypoints, 18)
/**
 * A hub-and-spoke network glyph — a centre node linked to four surrounding
 * nodes. Custom (no exact Lucide match) but drawn to the same 24-grid, stroke
 * width and `currentColor` conventions as the aliased icons.
 */
export function ConnectionIcon({ size = 18, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* spokes: centre-node edge → outer-node edge */}
      <line x1="12" y1="6" x2="12" y2="10" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="14" y1="12" x2="18" y2="12" />
      {/* centre + four nodes */}
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="12" cy="20" r="2" />
      <circle cx="4" cy="12" r="2" />
      <circle cx="20" cy="12" r="2" />
    </svg>
  )
}
export const SpeedIcon = make(Gauge, 18)
export const PulseIcon = make(Activity, 18)
export const DnsIcon = make(Server, 18)
export const SparkleIcon = make(Sparkles, 18)
export const HistoryIcon = make(History, 16)
export const UsageIcon = make(BarChart3, 18)
export const SettingsIcon = make(Settings, 18)
export const SunIcon = make(Sun, 18)
export const MoonIcon = make(Moon, 18)
export const InfoIcon = make(Info, 18)
export const TodayIcon = make(Clock, 18)
export const WeekIcon = make(CalendarRange, 18)
export const ComputerIcon = make(Laptop, 16)
export const TvIcon = make(Tv, 16)
export const PrinterIcon = make(Printer, 16)
export const ChipIcon = make(Cpu, 16)
export const DatabaseIcon = make(Database, 16)
export const MailIcon = make(Mail, 16)
export const MessageIcon = make(MessageSquare, 16)
export const TerminalIcon = make(Terminal, 16)
export const ClockIcon = make(Clock, 16)
export const BellIcon = make(Bell, 16)
export const FileTransferIcon = make(FolderSync, 16)
export const ShareIcon = make(Share2, 16)
export const HelpIcon = make(HelpCircle, 16)
export const QrCodeIcon = make(QrCode, 16)
export const NasIcon = make(HardDrive, 16)
export const TabletIcon = make(Tablet, 16)
export const WatchIcon = make(Watch, 16)
export const ConsoleIcon = make(Gamepad2, 16)
export const CameraIcon = make(Cctv, 16)
export const SpeakerIcon = make(Speaker, 16)
export const UnknownDeviceIcon = make(HelpCircle, 16)
export const TagIcon = make(Tag, 16)
export const ShieldAlertIcon = make(ShieldAlert, 16)
export const TrashIcon = make(Trash2, 16)
export const PlusIcon = make(Plus, 16)
export const EditIcon = make(Pencil, 15)
export const MoreIcon = make(MoreHorizontal, 16)
export const StopIcon = make(Square, 14)
export const PlayIcon = make(Play, 16)
export const RefreshIcon = make(RotateCw, 16)
export const SearchIcon = make(Search, 16)

// Window controls
export const MinimizeIcon = make(Minus, 15)
export const MaximizeIcon = make(Square, 13)
export const RestoreIcon = make(Copy, 13)
export const CloseIcon = make(X, 15)
export const AlertIcon = make(TriangleAlert, 16)

// Capability icons
export const BrowsingIcon = make(Compass, 22)
export const HdStreamIcon = makeHuge(HdIcon, 22)
export const UltraHdStreamIcon = makeHuge(FourKIcon, 22)
export const VideoCallIcon = make(Video, 22)
export const GamepadIcon = make(Gamepad2, 22)
export const CloudGamingIcon = make(Joystick, 22)
export const DownloadIcon = make(Download, 22)
export const LiveStreamIcon = make(Radio, 22)
export const GlobeStreamIcon = make(Globe, 22)
