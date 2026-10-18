/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: { DEFAULT: '#14532d', dark: '#0f3d22', light: '#1f7a43' },
      },
    },
  },
  plugins: [],
};
