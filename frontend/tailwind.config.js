/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand maroon — deep temple tones
        maroon: {
          50: '#fbeeee',
          100: '#f6d6d6',
          200: '#e9a9a9',
          300: '#d77777',
          400: '#b93f3f',
          500: '#8a1c1c',
          600: '#6e1717',
          700: '#5a0f0f',
          800: '#4a0e0e',
          900: '#380a0a',
        },
        // Gold accents
        gold: {
          50: '#fdf8e7',
          100: '#f8edc4',
          200: '#efd98a',
          300: '#e4c25a',
          400: '#d4a017',
          500: '#b88914',
          600: '#97700f',
          700: '#7a5a0c',
        },
        // Legacy "saffron" now aliases the gold scale so older pages harmonise
        saffron: {
          50: '#fdf8e7', 100: '#f8edc4', 200: '#efd98a', 300: '#e4c25a',
          400: '#d4a017', 500: '#b88914', 600: '#97700f', 700: '#7a5a0c',
          800: '#5f4609', 900: '#4a3607',
        },
        cream: '#fbf6ea',
        ivory: '#fdfaf2',
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans Telugu"', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', '"Noto Serif Telugu"', 'Georgia', 'serif'],
        display: ['Cinzel', '"Playfair Display"', 'serif'],
        poppins: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
        script: ['"Great Vibes"', 'cursive'],
        telugu: ['"Noto Sans Telugu"', 'sans-serif'],
        'telugu-serif': ['"Noto Serif Telugu"', 'serif'],
      },
      boxShadow: {
        soft: '0 2px 12px rgba(56,10,10,0.06)',
        card: '0 6px 24px rgba(90,15,15,0.08)',
        gold: '0 6px 18px rgba(201,162,39,0.30)',
        maroon: '0 10px 30px rgba(56,10,10,0.25)',
      },
      backgroundImage: {
        'maroon-deep': 'linear-gradient(135deg,#5a0f0f 0%,#380a0a 100%)',
        'gold-cta': 'linear-gradient(180deg,#e4c25a 0%,#d4a017 60%,#b88914 100%)',
      },
    },
  },
  plugins: [],
}
