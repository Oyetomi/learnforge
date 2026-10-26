/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        forge: {
          bg: '#0d1117',
          surface: '#161b22',
          surfaceHover: '#1f242c',
          border: '#30363d',
          accent: '#58a6ff',
          accentHover: '#388bfd',
          success: '#238636',
          warning: '#d29922',
          danger: '#da3633',
          text: '#c9d1d9',
          muted: '#8b949e',
          heading: '#f0f6fc',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
