import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // PWA
  // Pour activer PWA : décommenter et installer next-pwa
  // ...withPWA({ dest: 'public', register: true, skipWaiting: true }),

  // Sécurité headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',          value: 'DENY' },
          { key: 'X-Content-Type-Options',   value: 'nosniff' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",  // Next.js requires unsafe-eval in dev
              "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
              "font-src 'self' fonts.gstatic.com",
              "img-src 'self' data: blob: *.supabase.co",
              "connect-src 'self' *.supabase.co api.openai.com",
            ].join('; '),
          },
        ],
      },
    ]
  },

  // Optimisations
  experimental: {
    optimizePackageImports: ['recharts'],
  },
}

export default nextConfig
