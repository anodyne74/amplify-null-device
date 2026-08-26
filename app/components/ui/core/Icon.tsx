import React from 'react';
import {
  LayoutDashboard,
  Route,
  Home,
  Users,
  User,
  FileText,
  Settings,
  ClipboardList,
  Wrench,
  Receipt,
  MapPin,
  Truck,
  Building2,
  ChartColumn,
  Bell,
  Search,
  Plus,
  Ellipsis,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ArrowRight,
  Check,
  X,
  TriangleAlert,
  CircleHelp,
  Timer,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  Menu,
  Wallet,
  Mail,
  UserPlus,
  KeyRound,
  type LucideIcon,
} from 'lucide-react';

// Bundled locally rather than the design system's CDN mask-image approach
// (cdn.jsdelivr.net/npm/lucide-static) — the operator app runs in vehicles with
// unreliable connectivity, so per-icon network fetches aren't acceptable.
const ICONS: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  route: Route,
  home: Home,
  users: Users,
  user: User,
  'file-text': FileText,
  settings: Settings,
  'clipboard-list': ClipboardList,
  wrench: Wrench,
  receipt: Receipt,
  'map-pin': MapPin,
  truck: Truck,
  'building-2': Building2,
  'chart-column': ChartColumn,
  bell: Bell,
  search: Search,
  plus: Plus,
  ellipsis: Ellipsis,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  calendar: Calendar,
  'arrow-right': ArrowRight,
  check: Check,
  x: X,
  'triangle-alert': TriangleAlert,
  'circle-help': CircleHelp,
  timer: Timer,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  minus: Minus,
  info: Info,
  menu: Menu,
  wallet: Wallet,
  mail: Mail,
  'user-plus': UserPlus,
  'key-round': KeyRound,
};

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name'> {
  name: keyof typeof ICONS | (string & {});
  size?: number;
  strokeWidth?: number;
  title?: string;
}

export function Icon({ name, size = 18, strokeWidth = 1.5, title, className = '', ...rest }: IconProps) {
  const LucideComponent = ICONS[name];

  if (!LucideComponent) {
    return null;
  }

  return (
    <LucideComponent
      className={`nd-icon ${className}`}
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-icon={name}
      {...rest}
    />
  );
}
