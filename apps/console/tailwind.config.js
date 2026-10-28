/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          primary: '#2563EB',
          hover: '#1D4ED8',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          dark: '#111827',
        },
        background: {
          DEFAULT: '#F7F9FC',
          dark: '#0B0F19',
        },
        sidebar: {
          light: '#FFFFFF',
          dark: '#0F172A',
        },
        header: {
          light: '#FFFFFF',
          dark: '#0F172A',
        },
        appText: {
          primary: '#101828',
          secondary: '#64748B',
          muted: '#94A3B8',
          dark: '#F8FAFC',
        },
        appBorder: {
          light: '#E5E7EB',
          dark: '#1E293B',
        },
        success: '#16A34A',
        warning: '#D97706',
        danger: '#DC2626',
      },
      borderRadius: {
        card: '12px',
        panel: '16px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 3px rgba(16, 24, 40, 0.05), 0 1px 2px rgba(16, 24, 40, 0.03)',
        card: '0 4px 6px -1px rgba(16, 24, 40, 0.04), 0 2px 4px -2px rgba(16, 24, 40, 0.02)',
        elevated: '0 10px 15px -3px rgba(16, 24, 40, 0.08), 0 4px 6px -4px rgba(16, 24, 40, 0.03)',
        drawer: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [],
};
