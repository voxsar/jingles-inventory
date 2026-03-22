import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { branding } from '../config/branding';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@jingles.com');
  const [password, setPassword] = useState('');
  const { login, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      // error shown from store
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f2f4' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '16px' }}>
        <s-section>
          <s-stack gap="base">
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '8px' }}>{branding.appLogoEmoji}</div>
              <s-heading>{branding.appName}</s-heading>
              <s-text>Sign in to your account</s-text>
            </div>
            <form onSubmit={handleSubmit}>
              <s-stack gap="base">
                <s-text-field
                  label="Email"
                  type="email"
                  name="email"
                  value={email}
                  required
                  placeholder="admin@jingles.com"
                  onChange={(e: any) => setEmail(e.currentTarget.value)}
                />
                <s-password-field
                  label="Password"
                  name="password"
                  value={password}
                  required
                  placeholder="Enter your password"
                  onChange={(e: any) => setPassword(e.currentTarget.value)}
                />
                {error && <s-banner tone="critical">{error}</s-banner>}
                <s-button variant="primary" type="submit" disabled={isLoading}>
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </s-button>
              </s-stack>
            </form>
          </s-stack>
        </s-section>
      </div>
    </div>
  );
}
