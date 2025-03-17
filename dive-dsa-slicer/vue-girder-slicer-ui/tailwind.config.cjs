/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx,.tw.vue}",
  ],
  theme: {
    extend: {
      translate: {
        full: "100%"
      },
      colors: {
        // This should be changed by the user instead of hard coding
        primary: 'var(--gsu-color-primary)',
        // This will extend functionality of your color
        // so you can use opacity on it like text-secondary/80
        // var has to have rgb in it not hex color like: --color-info: 14 165 233;
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
      "0": "0",
      "24": "6rem",
      "32": "8rem",
      "1/4": "25%",
      "1/2": "50%",
      "3/4": "75%",
      full: "100%"
    }
  },
  variants: {
    rotate: ["responsive", "hover", "group-hover"],
    scale: ["responsive", "hover", "group-hover"]
  },  plugins: [],
}

