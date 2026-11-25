/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      translate: {
        full: '100%',
      },
      colors: {
        // Host apps override these CSS variables
        primary: 'var(--gsu-color-primary)',
        secondary: 'var(--gsu-color-secondary)',
        linkColor: 'var(--gsu-color-link)',
        textColor: 'var(--gsu-color-text)',
        borderColor: 'var(--gsu-color-border)',
        textMutedColor: 'var(--gsu-color-muted-text)',
        backgroundColor: 'var(--gsu-color-background)',
        bgMutedColor: 'var(--gsu-background-muted)',
        highlightedColor: 'var(--gsu-color-highlight)',
        selectedColor: 'var(--gsu-color-selected)',
      },
    },
    minWidth: {
      0: '0',
      24: '6rem',
      32: '8rem',
      '1/4': '25%',
      '1/2': '50%',
      '3/4': '75%',
      full: '100%',
    },
  },
  plugins: [],
}
