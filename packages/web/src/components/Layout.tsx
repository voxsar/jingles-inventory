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
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-white">🎵 Jingles Inventory</h1>
          <p className="text-xs text-gray-400 mt-1">{user?.email}</p>
          <span className="text-xs bg-primary-600 text-white px-2 py-0.5 rounded mt-1 inline-block">
            {user?.role}
          </span>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {allNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                )
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-gray-400 hover:text-white transition-colors px-3 py-2"
          >
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div />
            <div className="text-sm text-gray-500">
              Logged in as <strong>{user?.email}</strong>
            </div>
          </div>
        </header>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}


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
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-white">🎵 Jingles Inventory</h1>
          <p className="text-xs text-gray-400 mt-1">{user?.email}</p>
          <span className="text-xs bg-primary-600 text-white px-2 py-0.5 rounded mt-1 inline-block">
            {user?.role}
          </span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {allNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                )
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-gray-400 hover:text-white transition-colors px-3 py-2"
          >
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div />
            <div className="text-sm text-gray-500">
              Logged in as <strong>{user?.email}</strong>
            </div>
          </div>
        </header>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
