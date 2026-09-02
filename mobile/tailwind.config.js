/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // A warm, calm palette for a private couples app — not a generic dashboard blue.
        blush: '#F6E9E6',
        rose: '#C97C6D',
        ink: '#2E2A27',
        clay: '#8C7A72',
        cream: '#FBF6F2',
      },
    },
  },
  plugins: [],
};
