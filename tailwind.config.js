/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "#070A12",
        panel: "#0D1321",
        neon: "#FF3D5A",
        gold: "#FFC531",
        mint: "#34F5C5",
        violet: "#8B5CF6",
      },
      backdropBlur: { xs: "2px" },
    },
  },
  plugins: [],
};
