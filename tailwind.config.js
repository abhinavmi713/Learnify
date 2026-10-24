const STEPS = [5, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900]
const scale = (name) =>
  Object.fromEntries(
    STEPS.map((s) => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`])
  )

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    fontFamily: {
      sans: ["Plus Jakarta Sans", "sans-serif"],
      mono: ["JetBrains Mono", "monospace"],
      display: ["var(--font-display)", "serif"],
    },
    colors: {
      white: "#fff",
      black: "#000",
      transparent: "#ffffff00",
      // Every scale is driven by CSS variables from src/styles/themes.css so the
      // active theme (<html data-theme>) recolours the whole app.
      richblack: scale("richblack"),
      richblue: scale("richblue"),
      blue: scale("blue"),
      caribbeangreen: scale("caribbeangreen"),
      brown: scale("brown"),
      pink: scale("pink"),
      yellow: scale("yellow"),
      "pure-greys": scale("pure-greys"),
    },
    extend: {
      borderRadius: { card: "var(--radius-card)" },
      boxShadow: { card: "var(--shadow-card)" },
      maxWidth: {
        maxContent: "1260px",
        maxContentTab: "650px",
      },
    },
  },
  plugins: [],
};
