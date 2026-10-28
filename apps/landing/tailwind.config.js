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
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
          navy: '#111827',
        },
        canvas: {
          DEFAULT: '#FAF9F5', // Warm off-white background
          pure: '#FFFFFF',    // Pure white surface
          warm: '#F3F1EC',    // Controlled stone secondary surface
          muted: '#E8E5DD',
        },
        ink: {
          DEFAULT: '#111827', // Navy/charcoal primary typography
          secondary: '#374151',
          muted: '#6B7280',
          subtle: '#9CA3AF',
        },
        line: {
          DEFAULT: '#E6E4DD',
          strong: '#D5D2C8',
        },
        status: {
          availableBg: '#F0FDF4',
          availableText: '#166534',
          availableBorder: '#BBF7D0',
          comingBg: '#FFFBEB',
          comingText: '#92400E',
          comingBorder: '#FDE68A',
        },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'hero-desktop': ['48px', { lineHeight: '1.12', letterSpacing: '-0.02em', fontWeight: '700' }],
        'hero-mobile': ['33px', { lineHeight: '1.16', letterSpacing: '-0.015em', fontWeight: '700' }],
        'section-desktop': ['32px', { lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '700' }],
        'section-mobile': ['24px', { lineHeight: '1.24', letterSpacing: '-0.01em', fontWeight: '700' }],
      },
      boxShadow: {
        subtle: '0 1px 2px rgba(17, 24, 39, 0.03)',
        card: '0 1px 3px rgba(17, 24, 39, 0.04)',
        cardHover: '0 8px 20px -6px rgba(17, 24, 39, 0.07)',
        modal: '0 20px 40px -12px rgba(17, 24, 39, 0.16)',
      },
      borderRadius: {
        card: '10px',
        section: '12px',
      },
    },
  },
  plugins: [],
};
