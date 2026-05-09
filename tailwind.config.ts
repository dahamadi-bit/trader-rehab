import type { Config } from 'tailwindcss'

/**
 * Design System — TraderRehab
 *
 * Philosophie : minimaliste, sobre, institutionnel.
 * Palette : noir / gris / blanc. Rouge/vert utilisés uniquement
 * pour les états critiques (blocage, alerte) — jamais décoratifs.
 *
 * Pas de gradients agressifs. Pas d'animations rapides.
 * UX lente, réfléchie, anti-dopamine.
 */
const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Palette principale — tons neutres
        neutral: {
          950: '#0a0a0a',
          900: '#111111',
          800: '#1a1a1a',
          700: '#2a2a2a',
          600: '#3a3a3a',
          500: '#4a4a4a',
          400: '#6b6b6b',
          300: '#9b9b9b',
          200: '#c4c4c4',
          100: '#e8e8e8',
          50:  '#f5f5f5',
        },
        // Accent — utilisé uniquement pour actions primaires
        accent: {
          DEFAULT: '#4a9eff',
          dim:     '#2563eb',
          muted:   '#1e40af',
        },
        // États critiques — utilisés avec parcimonie
        danger:  '#e74c3c',   // blocage, alerte critique
        warning: '#e67e22',   // avertissement
        success: '#27ae60',   // uniquement confirmation neutre
        // Fond application
        surface: {
          base:  '#0d0d0d',
          card:  '#141414',
          input: '#1c1c1c',
          hover: '#222222',
        },
      },
      fontFamily: {
        // Police monospace pour données numériques (terminal pro)
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        // Police sans-serif sobre pour le texte
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xxs': ['0.65rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        'sm': '4px',
        DEFAULT: '6px',
        'md': '8px',
        'lg': '12px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.5)',
        'modal': '0 8px 32px rgba(0,0,0,0.8)',
        'glow-danger': '0 0 20px rgba(231,76,60,0.15)',
      },
      // Animations volontairement lentes (anti-dopamine)
      transitionDuration: {
        DEFAULT: '200ms',
        'slow': '400ms',
        'friction': '600ms',   // Pour les frictions intentionnelles
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'breathe': 'breathe 4s ease-in-out infinite',  // respiration guidée
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)',    opacity: '0.8' },
          '50%':       { transform: 'scale(1.15)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
