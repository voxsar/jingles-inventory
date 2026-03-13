import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/grns', label: 'GRNs' },
  { to: '/skus', label: 'Products (SKUs)' },
  { to: '/categories', label: 'Categories' },
  { to: '/locations', label: 'Locations' },
  { to: '/branches', label: 'Branches' },
  { to: '/stock-transfers', label: 'Stock Transfers' },
  { to: '/suppliers', label: 'Suppliers' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const allNavItems = user?.role === 'Vendor'
    ? [{ to: '/vendor-portal', label: 'Vendor Portal' }]
    : navItems;

  return (
    <>
      <s-app-nav>
        {allNavItems.map((item) => (
          <s-link key={item.to} href={item.to}>{item.label}</s-link>
        ))}
        <s-link href="/login" onClick={(e: React.MouseEvent) => { e.preventDefault(); handleLogout(); }}>Logout</s-link>
      </s-app-nav>
      <s-page>
        <Outlet />
      </s-page>
    </>
  );
}

