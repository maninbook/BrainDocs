/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // BrainDocs 커스텀 팔레트
        navy: {
          900: '#0A0E1A',
          800: '#0F1629',
          700: '#151E38',
          600: '#1E2D4F',
        },
        synapse: {
          blue: '#5BC8F5',
          green: '#4ECCA3',
          gold: '#F5C842',
          coral: '#FF6B6B',
          purple: '#A855F7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px #F5C842, 0 0 10px #F5C842' },
          '100%': { boxShadow: '0 0 10px #F5C842, 0 0 30px #F5C842, 0 0 50px #F5C842' },
        },
      },
    },
  },
  plugins: [],
}
