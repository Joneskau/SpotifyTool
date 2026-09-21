/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        spotify: {
          green: '#1DB954',
          'green-hover': '#1ed760',
          black: '#191414',
          'dark-gray': '#282828',
          'card-bg': '#181818',
          'card-hover': '#282828',
          'light-gray': '#B3B3B3',
          white: '#FFFFFF',
          warning: '#F59B23',
          error: '#E50914',
          'error-light': '#ff6b6b'
        }
      },
      fontFamily: {
        sans: ['Montserrat', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
