/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      maxWidth: {
        container: '1220px',
      },
      colors: {
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          600: '#1E5EFF',
          700: '#1749CC',
          800: '#1E40AF',
          900: '#1E3A8A',
          navy: '#0F172A',
        },
        canvas: {
          DEFAULT: '#F8F7F4', // Warm off-white background
          pure: '#FFFFFF',    // Pure white surface
          warm: '#F1EFEA',    // Controlled stone secondary surface
          muted: '#E6E4DD',
        },
        ink: {
          DEFAULT: '#0F172A', // Deep navy/charcoal primary typography (16.8:1 contrast)
          secondary: '#334155', // High-contrast slate body copy (9.6:1 contrast)
          muted: '#475569',     // Accessible muted metadata (6.9:1 contrast — exceeds WCAG AA)
          subtle: '#64748B',
        },
        line: {
          DEFAULT: '#E4E2DA',
          strong: '#D1CEC3',
        },
        status: {
          availableBg: '#DCFCE7',
          availableText: '#166534',
          availableBorder: '#BBF7D0',
          comingBg: '#FEF3C7',
          comingText: '#92400E',
          comingBorder: '#FDE68A',
        },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 1px 2px rgba(15, 23, 42, 0.03)',
        card: '0 1px 3px rgba(15, 23, 42, 0.04)',
        cardHover: '0 8px 20px -6px rgba(15, 23, 42, 0.08)',
        modal: '0 20px 40px -12px rgba(15, 23, 42, 0.18)',
      },
      borderRadius: {
        card: '10px',
        section: '12px',
      },
    },
  },
  plugins: [],
};
