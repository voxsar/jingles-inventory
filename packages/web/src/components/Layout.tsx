import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { branding } from '../config/branding';
import DesktopOutboxControl from './DesktopOutboxControl';
import {
  ArrowRightIcon,
  BarcodeIcon,
  BellIcon,
  BoxIcon,
  BriefcaseIcon,
  BuildingIcon,
  ChartIcon,
  ChevronRightIcon,
  CloudIcon,
  CoinsIcon,
  Cube3dIcon,
  DashboardIcon,
  FolderIcon,
  HelpIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  ReceiptIcon,
  ReturnArrowIcon,
  SettingsIcon,
  SparklesIcon,
  SpreadsheetIcon,
  SunIcon,
  TagIcon,
  TargetIcon,
  TransferIcon,
  UsersIcon,
  XIcon,
  type IconProps,
} from './AppIcons';
import { isDesktopRuntime } from '../utils/runtime';
import { getStoredUITheme, persistUITheme, toggleUITheme, type UITheme } from '../utils/uiTheme';

type NavIcon = (props: IconProps) => JSX.Element;

interface NavSectionItem {
  type: 'section';
  id: string;
  label: string;
}

interface NavRouteItem {
  type: 'route';
  to: string;
  label: string;
  icon: NavIcon;
  roles?: string[];
  desktopOnly?: boolean;
  accent?: boolean;
}

type NavItem = NavSectionItem | NavRouteItem;

const baseNavItems: NavItem[] = [
  { type: 'section', id: 'workspace', label: 'Workspace' },
  { type: 'route', to: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { type: 'route', to: '/inventory', label: 'Inventory', icon: BoxIcon },
  { type: 'route', to: '/skus', label: 'Products', icon: BoxIcon },
  { type: 'route', to: '/barcode-printing', label: 'Barcodes', icon: BarcodeIcon },
  { type: 'section', id: 'operations', label: 'Operations' },
  { type: 'route', to: '/grns', label: 'GRNs', icon: ReceiptIcon },
  { type: 'route', to: '/prns', label: 'PRNs', icon: ReturnArrowIcon },
  { type: 'route', to: '/stock-transfers', label: 'Stock Transfers', icon: TransferIcon },
  { type: 'route', to: '/pricing-overlays', label: 'Pricing Overlays', icon: TargetIcon },
  { type: 'route', to: '/pricing', label: 'Batch Pricing', icon: CoinsIcon },
  { type: 'route', to: '/vouchers', label: 'Gift Vouchers', icon: CoinsIcon, roles: ['Admin', 'Manager', 'Staff'] },
  { type: 'section', id: 'catalog', label: 'Catalog' },
  { type: 'route', to: '/categories', label: 'Categories', icon: FolderIcon },
  { type: 'route', to: '/tags', label: 'Tags', icon: TagIcon, roles: ['Admin', 'Manager'] },
  { type: 'route', to: '/suppliers', label: 'Suppliers', icon: BriefcaseIcon },
  { type: 'section', id: 'locations', label: 'Locations' },
  { type: 'route', to: '/branches', label: 'Branches & Storage', icon: BuildingIcon },
  { type: 'route', to: '/warehouse-3d', label: 'Warehouse 3D', icon: Cube3dIcon },
  { type: 'section', id: 'tools', label: 'Tools' },
  { type: 'route', to: '/imports', label: 'AI Imports', icon: SparklesIcon, accent: true, roles: ['Admin', 'Manager', 'Staff'] },
  { type: 'route', to: '/spreadsheet', label: 'Spreadsheet', icon: SpreadsheetIcon },
  { type: 'route', to: '/reports', label: 'Reports', icon: ChartIcon },
  { type: 'route', to: '/users', label: 'Users', icon: UsersIcon, roles: ['Admin', 'Manager'] },
  { type: 'route', to: '/devices', label: 'Devices', icon: CloudIcon, roles: ['Admin'] },
  { type: 'route', to: '/settings', label: 'Settings', icon: SettingsIcon },
  { type: 'route', to: '/help', label: 'Help & Docs', icon: HelpIcon },
  { type: 'section', id: 'desktop', label: 'Desktop' },
  { type: 'route', to: '/desktop-sync', label: 'Desktop Sync', icon: CloudIcon, desktopOnly: true },
];

const vendorNavItems: NavItem[] = [
  { type: 'section', id: 'workspace', label: 'Workspace' },
  { type: 'route', to: '/vendor-portal', label: 'Vendor Portal', icon: BriefcaseIcon },
];

export function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3 9 5v8l-9 5-9-5V8Z" />
        <path d="m3 8 9 5 9-5" />
        <path d="M12 13v8" />
      </svg>
    </div>
  );
}

function matchesRoute(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function getCurrentRoute(pathname: string, items: NavItem[]) {
  return items.find(
    (item): item is NavRouteItem =>
      item.type === 'route' && matchesRoute(pathname, item.to)
  );
}

function NavItems({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  return (
    <nav className="shell-nav">
      {items.map((item) =>
        item.type === 'section' ? (
          <div key={item.id} className="nav-section">
            {item.label}
          </div>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            end={!['/grns', '/prns'].includes(item.to)}
            className={({ isActive }) =>
              `nav-item${isActive ? ' is-active' : ''}${item.accent ? ' is-accent' : ''}`
            }
            onClick={onNavigate}
          >
            <item.icon className="nav-icon" size={17} />
            <span className="nav-label">{item.label}</span>
            {item.accent && <span className="nav-badge">AI</span>}
          </NavLink>
        )
      )}
    </nav>
  );
}

function CommandPalette({
  items,
  onClose,
}: {
  items: NavItem[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const routeItems = items.filter((item): item is NavRouteItem => item.type === 'route');
  const [query, setQuery] = useState('');

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return routeItems;
    }

    return routeItems.filter((item) => item.label.toLowerCase().includes(normalized));
  }, [query, routeItems]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="command-backdrop" onClick={onClose}>
      <div className="command-panel" onClick={(event) => event.stopPropagation()}>
        <div className="command-header">
          <div className="command-search">
            <SparklesIcon size={16} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search screens..."
            />
          </div>
          <button type="button" className="shell-icon-button" onClick={onClose} aria-label="Close command palette">
            <XIcon size={16} />
          </button>
        </div>
        <div className="command-results">
          {filteredItems.length === 0 ? (
            <div className="command-empty">
              <p>No matching screens.</p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <button
                type="button"
                key={item.to}
                className="command-item"
                onClick={() => {
                  navigate(item.to);
                  onClose();
                }}
              >
                <span className="command-item-icon">
                  <item.icon size={16} />
                </span>
                <span>{item.label}</span>
                <ArrowRightIcon size={14} className="command-item-arrow" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = isDesktopRuntime();
  const [theme, setTheme] = useState<UITheme>(() => getStoredUITheme());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  const navItems = useMemo(() => {
    const role = user?.role ?? '';
    const source = role === 'Vendor' ? vendorNavItems : baseNavItems;

    return source.filter((item) => {
      if (item.type === 'section') {
        return true;
      }

      if (item.desktopOnly && !isDesktop) {
        return false;
      }

      if (item.roles && !item.roles.includes(role)) {
        return false;
      }

      return true;
    });
  }, [isDesktop, user?.role]);

  const currentRoute = getCurrentRoute(location.pathname, navItems);
  const currentLabel = currentRoute?.label ?? 'Dashboard';
  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : '?';
  const brandName = branding.appShortName || branding.appName;

  useEffect(() => {
    persistUITheme(theme);
  }, [theme]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsCommandOpen(true);
      }

      if (event.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, []);

  useEffect(() => {
    setIsSidebarOpen(false);
    setIsCommandOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleThemeToggle = () => {
    setTheme((currentTheme) => toggleUITheme(currentTheme));
  };

  return (
    <div className="inventory-app-theme app-shell-root" data-theme={theme}>
      <div className="app-backdrop" aria-hidden="true">
        <div className="app-backdrop-spot" />
        <div className="app-backdrop-grain" />
      </div>

      <div className={`shell-overlay${isSidebarOpen ? ' is-visible' : ''}`} onClick={() => setIsSidebarOpen(false)} />

      <div className="app-shell">
        <aside className={`shell-sidebar${isSidebarOpen ? ' is-open' : ''}`}>
          <div className="brand">
            <BrandMark />
            <div>
              <div className="brand-name">{brandName}</div>
              <div className="brand-sub">{branding.appHeaderTitle}</div>
            </div>
          </div>

          <NavItems items={navItems} onNavigate={() => setIsSidebarOpen(false)} />

          <div className="user-card">
            <div className="user-avatar">{initials}</div>
            <div className="user-meta">
              <div className="user-email">{user?.email ?? 'Unknown user'}</div>
              <div className="user-role">{user?.role ?? 'Guest'}</div>
            </div>
            <button type="button" className="logout-button" onClick={handleLogout} aria-label="Log out">
              <LogOutIcon size={15} />
            </button>
          </div>
        </aside>

        <div className="shell-main">
          <header className="shell-topbar">
            <div className="shell-topbar-left">
              <button
                type="button"
                className="shell-icon-button shell-sidebar-toggle"
                onClick={() => setIsSidebarOpen((open) => !open)}
                aria-label="Toggle navigation"
              >
                <MenuIcon size={17} />
              </button>

              <div className="crumbs">
                <button
                  type="button"
                  className="crumb-link"
                  onClick={() => navigate('/dashboard')}
                >
                  {branding.appHeaderTitle}
                </button>
                <ChevronRightIcon size={14} />
                <strong>{currentLabel}</strong>
              </div>
            </div>

            <button type="button" className="shell-command-trigger" onClick={() => setIsCommandOpen(true)}>
              <span className="shell-command-icon">
                <SparklesIcon size={13} />
              </span>
              <span className="shell-command-text">Ask {brandName} anything, or search...</span>
              <kbd>Ctrl K</kbd>
            </button>

            <div className="top-actions">
              {isDesktop && <DesktopOutboxControl />}
              <button type="button" className="shell-icon-button" title="Toggle theme" onClick={handleThemeToggle}>
                {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
              </button>
              <button type="button" className="shell-icon-button has-dot" title="Notifications">
                <BellIcon size={17} />
              </button>
              <button type="button" className="shell-icon-button" title="Help" onClick={() => navigate('/help')}>
                <HelpIcon size={17} />
              </button>
            </div>
          </header>

          <main className="shell-page">
            <Outlet />
          </main>
        </div>
      </div>

      {isCommandOpen && <CommandPalette items={navItems} onClose={() => setIsCommandOpen(false)} />}
    </div>
  );
}
