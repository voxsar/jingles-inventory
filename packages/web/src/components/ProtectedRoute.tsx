import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
}

export default function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user, token } = useAuthStore();

  if (!token) return <Navigate to="/login" replace />;
  if (!user) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
