import type { Config } from "tailwindcss";

/**
 * Hamza General Store — design tokens.
 * Sampled from /attached_design_refrences (MaterialUIUX).
 * Semantic tokens (page/surface/border/text) are CSS variables that flip in
 * dark mode (see globals.css). Brand + accent ramps are brand constants.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic — driven by CSS variables, flip per theme
        page: "var(--bg-page)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
        },
        border: "var(--border)",
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
        },
        // Brand blue
        brand: {
          50: "#EAF1FC",
          100: "#CFE0F7",
          200: "#A9C8F1",
          500: "#1863D5",
          600: "#0B5BBE",
          700: "#054E9E",
        },
        // Accent ramps — { tile, icon, text }
        blue: { tile: "#E7EEFC", icon: "#1863D5", text: "#0B5BBE" },
        teal: { tile: "#E0F2F8", icon: "#0E9BC0", text: "#0A7C99" },
        green: { tile: "#E7F6EA", icon: "#16A34A", text: "#076809" },
        amber: { tile: "#FCEFD9", icon: "#D97706", text: "#B45309" },
        coral: { tile: "#FCE9E7", icon: "#E2615B", text: "#B42318" },
        purple: { tile: "#F3E9FA", icon: "#7C3AED", text: "#6D28D9" },
      },
      fontFamily: {
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "2xl": "16px",
        xl: "12px",
        lg: "10px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)",
        "card-hover": "0 4px 12px rgba(16,24,40,.08), 0 2px 4px rgba(16,24,40,.04)",
        drawer: "-8px 0 24px rgba(16,24,40,.10)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-up": {
          from: { transform: "translateY(8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in .2s ease-out",
        "slide-in-right": "slide-in-right .25s cubic-bezier(.16,1,.3,1)",
        "slide-up": "slide-up .2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
