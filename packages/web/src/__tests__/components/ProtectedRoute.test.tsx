import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuthStore } from '../../store/authStore';
import { UserRole } from '@jingles/shared';

vi.mock('../../store/authStore');

const mockUseAuthStore = vi.mocked(useAuthStore);

function renderProtectedRoute(
  children: React.ReactNode,
  roles?: string[],
  path = '/protected'
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
        <Route
          path="/protected"
          element={<ProtectedRoute roles={roles}>{children}</ProtectedRoute>}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /login when no token', () => {
    mockUseAuthStore.mockReturnValue({ user: null, token: null } as any);

    renderProtectedRoute(<div>Protected Content</div>);

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('shows loading spinner when token exists but user not loaded', () => {
    mockUseAuthStore.mockReturnValue({ token: 'valid-token', user: null } as any);

    renderProtectedRoute(<div>Protected Content</div>);

    // Loading spinner present (has animate-spin class)
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated and no role restriction', () => {
    mockUseAuthStore.mockReturnValue({
      token: 'valid-token',
      user: { id: 'user-001', role: UserRole.Staff, email: 'staff@test.com' },
    } as any);

    renderProtectedRoute(<div>Protected Content</div>);

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('renders children for Admin when roles restricts to Admin', () => {
    mockUseAuthStore.mockReturnValue({
      token: 'valid-token',
      user: { id: 'user-001', role: UserRole.Admin, email: 'admin@test.com' },
    } as any);

    renderProtectedRoute(<div>Admin Area</div>, [UserRole.Admin]);

    expect(screen.getByText('Admin Area')).toBeInTheDocument();
  });

  it('renders children for Manager when roles includes Manager', () => {
    mockUseAuthStore.mockReturnValue({
      token: 'valid-token',
      user: { id: 'user-001', role: UserRole.Manager, email: 'manager@test.com' },
    } as any);

    renderProtectedRoute(<div>Manager Area</div>, [UserRole.Admin, UserRole.Manager]);

    expect(screen.getByText('Manager Area')).toBeInTheDocument();
  });

  it('redirects to /dashboard when user lacks required role', () => {
    mockUseAuthStore.mockReturnValue({
      token: 'valid-token',
      user: { id: 'user-001', role: UserRole.Staff, email: 'staff@test.com' },
    } as any);

    renderProtectedRoute(<div>Admin Only Area</div>, [UserRole.Admin]);

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
    expect(screen.queryByText('Admin Only Area')).not.toBeInTheDocument();
  });

  it('redirects Vendor from Admin-only routes', () => {
    mockUseAuthStore.mockReturnValue({
      token: 'valid-token',
      user: { id: 'user-vendor-001', role: UserRole.Vendor, email: 'vendor@test.com' },
    } as any);

    renderProtectedRoute(<div>Admin Only</div>, [UserRole.Admin, UserRole.Manager]);

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });

  it('allows Vendor to access Vendor portal route', () => {
    mockUseAuthStore.mockReturnValue({
      token: 'valid-token',
      user: { id: 'user-vendor-001', role: UserRole.Vendor, email: 'vendor@test.com' },
    } as any);

    renderProtectedRoute(<div>Vendor Portal</div>, [UserRole.Vendor]);

    expect(screen.getByText('Vendor Portal')).toBeInTheDocument();
  });

  it('allows all roles when no role restriction is provided', () => {
    const roles = [UserRole.Admin, UserRole.Manager, UserRole.Staff, UserRole.Inspector, UserRole.Vendor];

    for (const role of roles) {
      mockUseAuthStore.mockReturnValue({
        token: 'valid-token',
        user: { id: 'user-001', role, email: `${role}@test.com` },
      } as any);

      const { unmount } = renderProtectedRoute(<div>Open Area</div>);
      expect(screen.getByText('Open Area')).toBeInTheDocument();
      unmount();
    }
  });
});
