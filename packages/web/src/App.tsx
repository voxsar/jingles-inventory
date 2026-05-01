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
import PRNPage from './pages/PRNPage';
import PRNDetailPage from './pages/PRNDetailPage';
import SKUPage from './pages/SKUPage';
import ReportsPage from './pages/ReportsPage';
import VendorPortalPage from './pages/VendorPortalPage';
import CategoriesPage from './pages/CategoriesPage';
import SettingsPage from './pages/SettingsPage';
import BranchesPage from './pages/BranchesPage';
import StockTransferPage from './pages/StockTransferPage';
import SuppliersPage from './pages/SuppliersPage';
import WarehouseVisualizerPage from './pages/WarehouseVisualizerPage';
import PricingPage from './pages/PricingPage';
import PricingOverlaysPage from './pages/PricingOverlaysPage';
import SpreadsheetPage from './pages/SpreadsheetPage';
import SKUSpreadsheetPage from './pages/spreadsheet/SKUSpreadsheetPage';
import InventorySpreadsheetPage from './pages/spreadsheet/InventorySpreadsheetPage';
import VendorSpreadsheetPage from './pages/spreadsheet/VendorSpreadsheetPage';
import BranchSpreadsheetPage from './pages/spreadsheet/BranchSpreadsheetPage';
import CategorySpreadsheetPage from './pages/spreadsheet/CategorySpreadsheetPage';
import FloorSpreadsheetPage from './pages/spreadsheet/FloorSpreadsheetPage';
import UnitSpreadsheetPage from './pages/spreadsheet/UnitSpreadsheetPage';
import TagSpreadsheetPage from './pages/spreadsheet/TagSpreadsheetPage';
import GRNSpreadsheetPage from './pages/spreadsheet/GRNSpreadsheetPage';
import TagsPage from './pages/TagsPage';
import UsersPage from './pages/UsersPage';

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
        <Route path="prns" element={<PRNPage />} />
        <Route path="prns/:id" element={<PRNDetailPage />} />
        <Route path="skus" element={<SKUPage />} />
        <Route path="locations" element={<Navigate to="/branches" replace />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="branches" element={<BranchesPage />} />
        <Route path="stock-transfers" element={<StockTransferPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="pricing-overlays" element={<PricingOverlaysPage />} />
        <Route path="warehouse-3d" element={<WarehouseVisualizerPage />} />
        <Route path="tags" element={
          <ProtectedRoute roles={['Admin', 'Manager']}>
            <TagsPage />
          </ProtectedRoute>
        } />
        <Route path="users" element={
          <ProtectedRoute roles={['Admin', 'Manager']}>
            <UsersPage />
          </ProtectedRoute>
        } />
        <Route path="spreadsheet" element={<SpreadsheetPage />} />
        <Route path="spreadsheet/skus" element={<SKUSpreadsheetPage />} />
        <Route path="spreadsheet/inventory" element={<InventorySpreadsheetPage />} />
        <Route path="spreadsheet/vendors" element={<VendorSpreadsheetPage />} />
        <Route path="spreadsheet/branches" element={<BranchSpreadsheetPage />} />
        <Route path="spreadsheet/categories" element={<CategorySpreadsheetPage />} />
        <Route path="spreadsheet/floors" element={<FloorSpreadsheetPage />} />
        <Route path="spreadsheet/units" element={<UnitSpreadsheetPage />} />
        <Route path="spreadsheet/tags" element={<TagSpreadsheetPage />} />
        <Route path="spreadsheet/grns" element={<GRNSpreadsheetPage />} />
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

