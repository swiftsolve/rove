/**
 * App icons: semantic aliases over lucide-react, so every icon shares one
 * stroke and the glyph behind a name changes here alone. The custom ones have
 * a file each beside this one.
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
  Cctv,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  Database,
  Download,
  EthernetPort,
  FolderSync,
  Gamepad2,
  Gauge,
  Globe,
  GlobeOff,
  HardDrive,
  HelpCircle,
  History,
  House,
  Info,
  Laptop,
  Layers,
  LayoutGrid,
  Lock,
  LockOpen,
  Mail,
  MessageSquare,
  Minus,
  MonitorSmartphone,
  Moon,
  MoreVertical,
  Network,
  Pencil,
  Play,
  Plus,
  Printer,
  QrCode,
  Radio,
  RotateCw,
  Router,
  Search,
  Server,
  Settings,
  Share2,
  ShieldAlert,
  Smartphone,
  Speaker,
  Square,
  Sun,
  Tablet,
  Terminal,
  TextSearch,
  Trash2,
  TriangleAlert,
  Tv,
  Video,
  Watch,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react'
import type { JSX } from 'react'

import { ICON_STROKE_WIDTH } from './CustomIcon'

export type IconProps = {
  /** Its width and height in px. Each icon has its own default. */
  size?: number
  /** Its colour (`text-positive`) and place in a line (`shrink-0`). It's the text colour by default. */
  className?: string
}

/** An app icon, drawn at `size`. What Button and IconButton take as `icon`. */
export type IconComponent = (props: IconProps) => JSX.Element

function appIconFromLucide(LucideComponent: LucideIcon, defaultSize: number): IconComponent {
  return function Icon({ size = defaultSize, className }: IconProps) {
    return <LucideComponent size={size} className={className} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
  }
}

// Lucide aliases

export const WifiIcon = appIconFromLucide(Wifi, 20)
export const WifiOffIcon = appIconFromLucide(WifiOff, 20)
export const EthernetIcon = appIconFromLucide(EthernetPort, 20)
export const OfflineIcon = appIconFromLucide(GlobeOff, 20)
export const ActivityIcon = appIconFromLucide(Activity, 18)
export const EventsIcon = appIconFromLucide(TextSearch, 18)
export const ZapIcon = appIconFromLucide(Zap, 22)
export const ArrowDownIcon = appIconFromLucide(ArrowDown, 16)
export const ArrowUpIcon = appIconFromLucide(ArrowUp, 16)
export const ArrowRightIcon = appIconFromLucide(ArrowRight, 16)
export const ArrowUpRightIcon = appIconFromLucide(ArrowUpRight, 16)
export const ChevronDownIcon = appIconFromLucide(ChevronDown, 16)
export const ChevronRightIcon = appIconFromLucide(ChevronRight, 16)
export const ArrowLeftIcon = appIconFromLucide(ArrowLeft, 16)
export const CheckIcon = appIconFromLucide(Check, 16)
export const HomeIcon = appIconFromLucide(House, 18)
export const LayersIcon = appIconFromLucide(Layers, 18)
export const AppsIcon = appIconFromLucide(LayoutGrid, 18)
export const DeviceIcon = appIconFromLucide(Smartphone, 18)
export const DevicesIcon = appIconFromLucide(MonitorSmartphone, 18)
export const RouterIcon = appIconFromLucide(Router, 18)
export const CloudIcon = appIconFromLucide(Cloud, 18)
export const GlobeIcon = appIconFromLucide(Globe, 18)
export const IpIcon = appIconFromLucide(Network, 18)
export const SpeedIcon = appIconFromLucide(Gauge, 18)
export const PulseIcon = appIconFromLucide(Activity, 18)
export const DnsIcon = appIconFromLucide(Server, 18)
export const HistoryIcon = appIconFromLucide(History, 16)
export const UsageIcon = appIconFromLucide(BarChart3, 18)
export const SettingsIcon = appIconFromLucide(Settings, 18)
export const SunIcon = appIconFromLucide(Sun, 18)
export const MoonIcon = appIconFromLucide(Moon, 18)
export const TodayIcon = appIconFromLucide(Clock, 18)
export const WeekIcon = appIconFromLucide(CalendarRange, 18)
export const ComputerIcon = appIconFromLucide(Laptop, 16)
export const TvIcon = appIconFromLucide(Tv, 16)
export const PrinterIcon = appIconFromLucide(Printer, 16)
export const DatabaseIcon = appIconFromLucide(Database, 16)
export const MailIcon = appIconFromLucide(Mail, 16)
export const MessageIcon = appIconFromLucide(MessageSquare, 16)
export const TerminalIcon = appIconFromLucide(Terminal, 16)
export const ClockIcon = appIconFromLucide(Clock, 16)
export const BellIcon = appIconFromLucide(Bell, 16)
export const FileTransferIcon = appIconFromLucide(FolderSync, 16)
export const ShareIcon = appIconFromLucide(Share2, 16)
export const InfoIcon = appIconFromLucide(Info, 16)
export const QrCodeIcon = appIconFromLucide(QrCode, 16)
export const NasIcon = appIconFromLucide(HardDrive, 16)
export const TabletIcon = appIconFromLucide(Tablet, 16)
export const WatchIcon = appIconFromLucide(Watch, 16)
export const ConsoleIcon = appIconFromLucide(Gamepad2, 16)
export const CameraIcon = appIconFromLucide(Cctv, 16)
export const SpeakerIcon = appIconFromLucide(Speaker, 16)
export const UnknownDeviceIcon = appIconFromLucide(HelpCircle, 16)
export const LockIcon = appIconFromLucide(Lock, 14)
export const UnlockIcon = appIconFromLucide(LockOpen, 14)
export const ShieldAlertIcon = appIconFromLucide(ShieldAlert, 16)
export const TrashIcon = appIconFromLucide(Trash2, 16)
export const PlusIcon = appIconFromLucide(Plus, 16)
export const EditIcon = appIconFromLucide(Pencil, 15)
export const MoreVerticalIcon = appIconFromLucide(MoreVertical, 16)
/** Lucide's Square, filled: the stop symbol, where the outline would read as Maximize. */
export function StopIcon({ size = 14, className }: IconProps) {
  return <Square size={size} className={className} strokeWidth={ICON_STROKE_WIDTH} fill="currentColor" aria-hidden />
}
export const PlayIcon = appIconFromLucide(Play, 16)
export const RefreshIcon = appIconFromLucide(RotateCw, 16)
export const SearchIcon = appIconFromLucide(Search, 16)
export const AlertIcon = appIconFromLucide(TriangleAlert, 16)

// Window controls
export const MinimizeIcon = appIconFromLucide(Minus, 15)
export const CloseIcon = appIconFromLucide(X, 15)

// Capability icons
export const BrowsingIcon = appIconFromLucide(AppWindowMac, 22)
export const VideoCallIcon = appIconFromLucide(Video, 22)
export const GamepadIcon = appIconFromLucide(Gamepad2, 22)
export const DownloadIcon = appIconFromLucide(Download, 22)
export const LiveStreamIcon = appIconFromLucide(Radio, 22)
