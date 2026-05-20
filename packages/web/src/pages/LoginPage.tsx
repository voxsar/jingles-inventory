import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { branding } from '../config/branding';
import { BrandMark } from '../components/Layout';
import { MoonIcon, SparklesIcon, SunIcon } from '../components/AppIcons';
import { getStoredUITheme, persistUITheme, toggleUITheme, type UITheme } from '../utils/uiTheme';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@theredsun.org');
  const [password, setPassword] = useState('');
  const [theme, setTheme] = useState<UITheme>(() => getStoredUITheme());
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

  const handleThemeToggle = () => {
    setTheme((currentTheme) => {
      const nextTheme = toggleUITheme(currentTheme);
      persistUITheme(nextTheme);
      return nextTheme;
    });
  };

  return (
    <div className="inventory-app-theme auth-screen" data-theme={theme}>
      <div className="app-backdrop" aria-hidden="true">
        <div className="app-backdrop-spot" />
        <div className="app-backdrop-grain" />
      </div>

      <button type="button" className="auth-theme-toggle shell-icon-button" onClick={handleThemeToggle}>
        {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
      </button>

      <div className="auth-card">
        <div className="auth-card-side">
          <div className="auth-brand">
            <BrandMark />
            <div>
              <p className="auth-brand-name">{branding.appShortName || branding.appName}</p>
              <p className="auth-brand-subtitle">{branding.appHeaderTitle}</p>
            </div>
          </div>
          <div className="auth-hero">
            <span className="chip chip-accent">
              <SparklesIcon size={12} />
              Unified web + desktop UI
            </span>
            <h1>Modern inventory control, one shared interface.</h1>
            <p>
              Sign in to access the same updated workspace across the browser app and the Electron desktop shell.
            </p>
          </div>
        </div>

        <div className="auth-card-main">
          <div className="auth-form-header">
            <h2>Sign in</h2>
            <p>Use your existing account to continue.</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="field">
              <span className="label">Email</span>
              <input
                className="input-field auth-input"
                type="email"
                name="email"
                value={email}
                required
                placeholder="admin@theredsun.org"
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            </label>

            <label className="field">
              <span className="label">Password</span>
              <input
                className="input-field auth-input"
                type="password"
                name="password"
                value={password}
                required
                placeholder="Enter your password"
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
            </label>

            {error && <div className="auth-error">{error}</div>}

            <button className="btn-primary auth-submit" type="submit" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
