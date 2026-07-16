/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#B35C44",
          light: "#c0725a",
          dark: "#994d38",
        },
        secondary: {
          DEFAULT: "#707A65",
          light: "#828c77",
          dark: "#5e6754",
        },
        tertiary: {
          DEFAULT: "#5D5E7D",
          light: "#707194",
          dark: "#4a4b64",
        },
        brandNeutral: {
          DEFAULT: "#F7F3F0",
          dark: "#e8e1da",
        },
        dark: {
          950: "#080d14",
          900: "#0d1321",
          800: "#131c2e",
          750: "#192338",
          700: "#1e2d42",
          600: "#2a3f57",
          500: "#3a5068",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
