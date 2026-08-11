/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f8ff',
          100: '#eaf0ff',
          200: '#cfe0ff',
          300: '#a8c8ff',
          400: '#6ea3ff',
          500: '#3b82f6',
          600: '#1f6feb',
          700: '#1457c6',
          800: '#0f3e98',
          900: '#092b66'
        },
        neutral: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#0b1220'
        }
      },
      spacing: {
        '9': '2.25rem',
      },
      borderRadius: {
        lg: '12px'
      },
      boxShadow: {
        'card': '0 6px 18px rgba(16,24,40,0.06)'
      }
    },
  },
  plugins: [],
}
