import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const configuredApiBaseUrl = env.VITE_API_BASE_URL?.trim();
  const apiProxyTarget = configuredApiBaseUrl
    ? trimTrailingSlash(configuredApiBaseUrl)
    : 'http://localhost:3001';

  return {
    plugins: [react()],
    base: './',
    resolve: {
      alias: [
        {
          find: '@jingles/shared',
          replacement: path.resolve(__dirname, '../shared/src/index.ts'),
        },
        {
          find: /^@jingles\/shared\/(.*)$/,
          replacement: `${path.resolve(__dirname, '../shared/src')}/$1`,
        },
      ],
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/__tests__/setup.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/main.tsx', 'src/__tests__/**'],
      },
    },
  };
});
