import { defineConfig } from 'vitest/config';

// TODO(security): Pure client-side static simulation app (no backend DB, user accounts, or file uploads).
// Dev and preview servers are bound strictly to 127.0.0.1 with strict security headers.
const securityHeaders = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    headers: securityHeaders,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    headers: securityHeaders,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    target: 'es2022',
  },
  test: {
    css: true,
  },
});
