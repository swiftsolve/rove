/**
 * App icons — thin aliases over lucide-react so every icon shares the same
 * optical size and stroke. Import these semantic names; swap the underlying
 * icon here in one place if the design changes. The custom ones have a
 * file each beside this one.
 */
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AppWindowMac,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronRight,
  Cctv,
  Clock,
  Cloud,
  Cpu,
  Copy,
  Database,
  Download,
  EthernetPort,
  FolderSync,
  HardDrive,
  Minus,
  MonitorSmartphone,
  MoreVertical,
  Play,
  RotateCw,
  Gamepad2,
  Gauge,
  Globe,
  GlobeOff,
  HelpCircle,
  History,
  House,
  Laptop,
  LayoutGrid,
  Layers,
  LockKeyhole,
  LockKeyholeOpen,
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
  WifiOff,
  X,
  Zap,
} from 'lucide-react'

export type IconProps = {
  /** Its width and height in px. Each icon has its own default. */
  size?: number
  /** Its colour (`text-positive`) and place in a line (`shrink-0`). It's the text colour by default. */
  className?: string
}

/** An app icon, drawn at `size`. What Button and IconButton take as `icon`. */
export type IconComponent = (props: IconProps) => JSX.Element

function make(Base: LucideIcon, defaultSize: number): IconComponent {
  return function Icon({ size = defaultSize, className }: IconProps): JSX.Element {
    return <Base size={size} className={className} strokeWidth={1.75} aria-hidden />
  }
}

// Lucide aliases

export const WifiIcon = make(Wifi, 20)
export const WifiOffIcon = make(WifiOff, 20)
export const EthernetIcon = make(EthernetPort, 20)
export const OfflineIcon = make(GlobeOff, 20)
export const ActivityIcon = make(Activity, 18)
export const EventsIcon = make(TextSearch, 18)
export const ZapIcon = make(Zap, 22)
export const ArrowDownIcon = make(ArrowDown, 16)
export const ArrowUpIcon = make(ArrowUp, 16)
export const ArrowRightIcon = make(ArrowRight, 16)
export const ArrowUpRightIcon = make(ArrowUpRight, 16)
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
export const SpeedIcon = make(Gauge, 18)
export const PulseIcon = make(Activity, 18)
export const DnsIcon = make(Server, 18)
export const SparkleIcon = make(Sparkles, 18)
export const HistoryIcon = make(History, 16)
export const UsageIcon = make(BarChart3, 18)
export const SettingsIcon = make(Settings, 18)
export const SunIcon = make(Sun, 18)
export const MoonIcon = make(Moon, 18)
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
export const LockIcon = make(LockKeyhole, 14)
export const UnlockIcon = make(LockKeyholeOpen, 14)
export const ShieldAlertIcon = make(ShieldAlert, 16)
export const TrashIcon = make(Trash2, 16)
export const PlusIcon = make(Plus, 16)
export const EditIcon = make(Pencil, 15)
export const MoreVerticalIcon = make(MoreVertical, 16)
export const StopIcon = make(Square, 14)
export const PlayIcon = make(Play, 16)
export const RefreshIcon = make(RotateCw, 16)
export const SearchIcon = make(Search, 16)
export const AlertIcon = make(TriangleAlert, 16)

// Window controls
export const MinimizeIcon = make(Minus, 15)
export const MaximizeIcon = make(Square, 13)
export const RestoreIcon = make(Copy, 13)
export const CloseIcon = make(X, 15)

// Capability icons
export const BrowsingIcon = make(AppWindowMac, 22)
export const VideoCallIcon = make(Video, 22)
export const GamepadIcon = make(Gamepad2, 22)
export const DownloadIcon = make(Download, 22)
export const LiveStreamIcon = make(Radio, 22)
export const GlobeStreamIcon = make(Globe, 22)
