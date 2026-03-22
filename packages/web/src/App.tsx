import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InventoryPage from './pages/InventoryPage';
import GRNPage from './pages/GRNPage';
import GRNDetailPage from './pages/GRNDetailPage';
import SKUPage from './pages/SKUPage';
import ReportsPage from './pages/ReportsPage';
import VendorPortalPage from './pages/VendorPortalPage';
import CategoriesPage from './pages/CategoriesPage';
import SettingsPage from './pages/SettingsPage';
import BranchesPage from './pages/BranchesPage';
import StockTransferPage from './pages/StockTransferPage';
import SuppliersPage from './pages/SuppliersPage';
import WarehouseVisualizerPage from './pages/WarehouseVisualizerPage';

function AppRoutes() {
  const { loadUser, token } = useAuthStore();

  useEffect(() => {
    if (token) loadUser();
  }, [token, loadUser]);

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
        <Route path="locations" element={<Navigate to="/branches" replace />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="branches" element={<BranchesPage />} />
        <Route path="stock-transfers" element={<StockTransferPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="warehouse-3d" element={<WarehouseVisualizerPage />} />
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

