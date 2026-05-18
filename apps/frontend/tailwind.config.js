/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        ink: {
          950: "#101216",
          900: "#171a21",
          800: "#222630"
        }
      },
      boxShadow: {
        soft: "0 18px 50px rgba(16, 18, 22, 0.10)"
      }
    }
  },
  plugins: []
};
