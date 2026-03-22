import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const navItems = [
  { to: '/dashboard', label: '📊 Dashboard' },
  { to: '/inventory', label: '📦 Inventory' },
  { to: '/grns', label: '📋 GRNs' },
  { to: '/skus', label: '🎵 Products (SKUs)' },
  { to: '/categories', label: '🗂️ Categories' },
  { to: '/branches', label: '🏢 Branches & Storage' },
  { to: '/warehouse-3d', label: '🏗️ Warehouse 3D' },
  { to: '/stock-transfers', label: '🔄 Stock Transfers' },
  { to: '/suppliers', label: '🤝 Suppliers' },
  { to: '/reports', label: '📈 Reports' },
  { to: '/settings', label: '⚙️ Settings' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const allNavItems = user?.role === 'Vendor'
    ? [{ to: '/vendor-portal', label: '🛒 Vendor Portal' }]
    : navItems;

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : '?';

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <span className="text-xl font-bold text-primary-600">🎵 Jingles</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3">
          {allNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center px-6 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User profile & logout */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.email ?? '—'}</p>
              <p className="text-xs text-gray-500 truncate">{user?.role ?? ''}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
          >
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 flex-shrink-0">
          <h1 className="text-lg font-semibold text-gray-800">Jingles Inventory Management</h1>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

