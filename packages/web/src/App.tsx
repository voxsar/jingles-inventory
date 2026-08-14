import { useEffect } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import SessionLock from './components/SessionLock';
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
import BarcodePrintPage from './pages/BarcodePrintPage';
import BranchesPage from './pages/BranchesPage';
import StockTransferPage from './pages/StockTransferPage';
import StockAdjustmentsPage from './pages/StockAdjustmentsPage';
import SuppliersPage from './pages/SuppliersPage';
import CustomersPage from './pages/CustomersPage';
import WarehouseVisualizerPage from './pages/WarehouseVisualizerPage';
import PricingPage from './pages/PricingPage';
import PricingOverlaysPage from './pages/PricingOverlaysPage';
import SpreadsheetPage from './pages/SpreadsheetPage';
import ImportsPage from './pages/ImportsPage';
import SKUSpreadsheetPage from './pages/spreadsheet/SKUSpreadsheetPage';
import InventorySpreadsheetPage from './pages/spreadsheet/InventorySpreadsheetPage';
import VendorSpreadsheetPage from './pages/spreadsheet/VendorSpreadsheetPage';
import BranchSpreadsheetPage from './pages/spreadsheet/BranchSpreadsheetPage';
import CategorySpreadsheetPage from './pages/spreadsheet/CategorySpreadsheetPage';
import FloorSpreadsheetPage from './pages/spreadsheet/FloorSpreadsheetPage';
import UnitSpreadsheetPage from './pages/spreadsheet/UnitSpreadsheetPage';
import TagSpreadsheetPage from './pages/spreadsheet/TagSpreadsheetPage';
import GRNSpreadsheetPage from './pages/spreadsheet/GRNSpreadsheetPage';
import BatchSpreadsheetPage from './pages/spreadsheet/BatchSpreadsheetPage';
import RackSpreadsheetPage from './pages/spreadsheet/RackSpreadsheetPage';
import ShelfSpreadsheetPage from './pages/spreadsheet/ShelfSpreadsheetPage';
import BoxSpreadsheetPage from './pages/spreadsheet/BoxSpreadsheetPage';
import StockTransferSpreadsheetPage from './pages/spreadsheet/StockTransferSpreadsheetPage';
import UserSpreadsheetPage from './pages/spreadsheet/UserSpreadsheetPage';
import AttributeSpreadsheetPage from './pages/spreadsheet/AttributeSpreadsheetPage';
import TagsPage from './pages/TagsPage';
import UsersPage from './pages/UsersPage';
import DesktopSyncPage from './pages/DesktopSyncPage';
import HelpPage from './pages/HelpPage';
import VouchersPage from './pages/VouchersPage';
import DevicesPage from './pages/DevicesPage';
import PosTerminalPage from './pages/PosTerminalPage';
import { isDesktopRuntime } from './utils/runtime';

function AppRoutes() {
  const { loadUser, token } = useAuthStore();

  useEffect(() => {
    if (token) loadUser();
  }, [token, loadUser]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/pos"
        element={
          <ProtectedRoute roles={['Admin', 'Manager', 'Staff']}>
            <>
              <SessionLock />
              <PosTerminalPage />
            </>
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <>
              <SessionLock />
              <Layout />
            </>
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
        <Route path="barcode-printing" element={<BarcodePrintPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="branches" element={<BranchesPage />} />
        <Route path="stock-transfers" element={<StockTransferPage />} />
        <Route path="stock-adjustments" element={<ProtectedRoute roles={['Admin', 'Manager', 'Staff']}><StockAdjustmentsPage /></ProtectedRoute>} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="pricing-overlays" element={<PricingOverlaysPage />} />
        <Route path="vouchers" element={<ProtectedRoute roles={['Admin', 'Manager', 'Staff']}><VouchersPage /></ProtectedRoute>} />
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
        <Route path="devices" element={
          <ProtectedRoute roles={['Admin']}>
            <DevicesPage />
          </ProtectedRoute>
        } />
        <Route path="spreadsheet" element={<SpreadsheetPage />} />
        <Route path="imports" element={
          <ProtectedRoute roles={['Admin', 'Manager', 'Staff']}>
            <ImportsPage />
          </ProtectedRoute>
        } />
        <Route path="spreadsheet/skus" element={<SKUSpreadsheetPage />} />
        <Route path="spreadsheet/inventory" element={<InventorySpreadsheetPage />} />
        <Route path="spreadsheet/vendors" element={<VendorSpreadsheetPage />} />
        <Route path="spreadsheet/branches" element={<BranchSpreadsheetPage />} />
        <Route path="spreadsheet/categories" element={<CategorySpreadsheetPage />} />
        <Route path="spreadsheet/floors" element={<FloorSpreadsheetPage />} />
        <Route path="spreadsheet/units" element={<UnitSpreadsheetPage />} />
        <Route path="spreadsheet/tags" element={<TagSpreadsheetPage />} />
        <Route path="spreadsheet/grns" element={<GRNSpreadsheetPage />} />
        <Route path="spreadsheet/batches" element={<BatchSpreadsheetPage />} />
        <Route path="spreadsheet/racks" element={<RackSpreadsheetPage />} />
        <Route path="spreadsheet/shelves" element={<ShelfSpreadsheetPage />} />
        <Route path="spreadsheet/boxes" element={<BoxSpreadsheetPage />} />
        <Route path="spreadsheet/stock-transfers" element={<StockTransferSpreadsheetPage />} />
        <Route path="spreadsheet/users" element={
          <ProtectedRoute roles={['Admin', 'Manager']}>
            <UserSpreadsheetPage />
          </ProtectedRoute>
        } />
        <Route path="spreadsheet/attributes" element={
          <ProtectedRoute roles={['Admin', 'Manager']}>
            <AttributeSpreadsheetPage />
          </ProtectedRoute>
        } />
        <Route path="desktop-sync" element={<DesktopSyncPage />} />
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
  const Router = isDesktopRuntime() ? HashRouter : BrowserRouter;

  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
