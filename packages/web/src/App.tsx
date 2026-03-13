import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InventoryPage from './pages/InventoryPage';
import GRNPage from './pages/GRNPage';
import GRNDetailPage from './pages/GRNDetailPage';
import SKUPage from './pages/SKUPage';
import LocationsPage from './pages/LocationsPage';
import ReportsPage from './pages/ReportsPage';
import VendorPortalPage from './pages/VendorPortalPage';
import CategoriesPage from './pages/CategoriesPage';
import SettingsPage from './pages/SettingsPage';
import BranchesPage from './pages/BranchesPage';
import StockTransferPage from './pages/StockTransferPage';
import SuppliersPage from './pages/SuppliersPage';

function AppRoutes() {
  const { loadUser, token } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (token) loadUser();
  }, [token, loadUser]);

  useEffect(() => {
    const handler = (e: Event) => {
      const href = (e.target as Element)?.getAttribute('href');
      if (href) navigate(href);
    };
    document.addEventListener('shopify:navigate', handler);
    return () => document.removeEventListener('shopify:navigate', handler);
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="grns" element={<GRNPage />} />
        <Route path="grns/:id" element={<GRNDetailPage />} />
        <Route path="skus" element={<SKUPage />} />
        <Route path="locations" element={<LocationsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="branches" element={<BranchesPage />} />
        <Route path="stock-transfers" element={<StockTransferPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route
          path="vendor-portal"
          element={
            <ProtectedRoute roles={['Vendor']}>
              <VendorPortalPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

