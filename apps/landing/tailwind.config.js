/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
          navy: '#172554',
        },
        canvas: {
          DEFAULT: '#FAF9F6', // Warm alabaster / editorial paper
          pure: '#FFFFFF',
          warm: '#F4F3EF',    // Subtle warm stone section background
          muted: '#EBE9E2',
        },
        ink: {
          DEFAULT: '#111827', // Primary deep charcoal
          secondary: '#374151',
          muted: '#6B7280',
          subtle: '#9CA3AF',
        },
        line: {
          DEFAULT: '#E5E4DF',
          strong: '#D4D2C8',
        },
        status: {
          availableBg: '#ECFDF3',
          availableText: '#166534',
          availableBorder: '#BBF7D0',
          comingBg: '#FFFBEB',
          comingText: '#9A3412',
          comingBorder: '#FDE68A',
          reservedBg: '#F1F5F9',
          reservedText: '#475569',
          reservedBorder: '#CBD5E1',
        },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Be Vietnam Pro"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 1px 2px rgba(17, 24, 39, 0.04)',
        card: '0 2px 8px -2px rgba(17, 24, 39, 0.05), 0 1px 3px -1px rgba(17, 24, 39, 0.03)',
        cardHover: '0 12px 24px -6px rgba(17, 24, 39, 0.08), 0 4px 8px -4px rgba(17, 24, 39, 0.04)',
        modal: '0 24px 48px -12px rgba(17, 24, 39, 0.18)',
      },
      borderRadius: {
        card: '10px',
        section: '14px',
      },
    },
  },
  plugins: [],
};
