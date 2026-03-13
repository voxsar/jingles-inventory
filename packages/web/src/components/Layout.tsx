import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/inventory', label: 'Inventory', icon: '📦' },
  { to: '/grns', label: 'GRNs', icon: '📋' },
  { to: '/skus', label: 'Products (SKUs)', icon: '🏷️' },
  { to: '/categories', label: 'Categories', icon: '📂' },
  { to: '/locations', label: 'Locations', icon: '📍' },
  { to: '/branches', label: 'Branches', icon: '🏢' },
  { to: '/stock-transfers', label: 'Stock Transfers', icon: '🔄' },
  { to: '/suppliers', label: 'Suppliers', icon: '🏭' },
  { to: '/reports', label: 'Reports', icon: '📈' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const allNavItems = user?.role === 'Vendor'
    ? [{ to: '/vendor-portal', label: 'Vendor Portal', icon: '🏪' }]
    : navItems;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-950 text-white flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-800">
          <h1 className="text-lg font-bold text-white tracking-tight">🎵 Jingles</h1>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{user?.email}</p>
          <span className="text-xs bg-primary-600 text-white px-2 py-0.5 rounded-md mt-2 inline-block font-medium">
            {user?.role}
          </span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {allNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                )
              }
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-all font-medium"
          >
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto flex flex-col">
        <header className="bg-white border-b border-gray-200 px-6 py-3 shrink-0">
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="inline-block w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-center leading-7 text-xs font-bold">
                {user?.email?.[0]?.toUpperCase()}
              </span>
              <strong className="text-gray-700">{user?.email}</strong>
            </div>
          </div>
        </header>
        <div className="flex-1 p-6 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

