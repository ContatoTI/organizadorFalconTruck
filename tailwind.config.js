/** @type {import('tailwindcss').Config} */
import tailwindcssAnimate from "tailwindcss-animate";

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      /* ── Tipografia ──────────────────────────────────────────────── */
      /* var(--font-sans) é injetado pelo next/font (Geist) no layout.tsx */
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "sans-serif"],
      },

      /* ── Cores (via CSS custom properties) ──────────────────────── */
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",

        /* Sidebar */
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          border: "hsl(var(--sidebar-border))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          ring: "hsl(var(--sidebar-ring))",
          "muted-foreground": "hsl(var(--sidebar-muted-foreground))",
        },

        /* Cores de Categoria */
        cat: {
          blue:         "hsl(var(--cat-blue))",
          "blue-bg":    "hsl(var(--cat-blue-bg))",
          green:        "hsl(var(--cat-green))",
          "green-bg":   "hsl(var(--cat-green-bg))",
          coral:        "hsl(var(--cat-coral))",
          "coral-bg":   "hsl(var(--cat-coral-bg))",
          purple:       "hsl(var(--cat-purple))",
          "purple-bg":  "hsl(var(--cat-purple-bg))",
          pink:         "hsl(var(--cat-pink))",
          "pink-bg":    "hsl(var(--cat-pink-bg))",
          yellow:       "hsl(var(--cat-yellow))",
          "yellow-bg":  "hsl(var(--cat-yellow-bg))",
          teal:         "hsl(var(--cat-teal))",
          "teal-bg":    "hsl(var(--cat-teal-bg))",
          red:          "hsl(var(--cat-red))",
          "red-bg":     "hsl(var(--cat-red-bg))",
        },
      },

      /* ── Border Radius ───────────────────────────────────────────── */
      borderRadius: {
        sm:  "calc(var(--radius) - 4px)",   /* 6px  */
        md:  "calc(var(--radius) - 2px)",   /* 8px  */
        lg:  "var(--radius)",               /* 10px */
        xl:  "calc(var(--radius) + 4px)",   /* 14px */
        "2xl": "calc(var(--radius) + 8px)", /* 18px */
      },

      /* ── Sistema de Sombras ──────────────────────────────────────── */
      boxShadow: {
        xs:           "var(--shadow-xs)",
        card:         "var(--shadow-sm)",
        "card-hover": "var(--shadow-md)",
        panel:        "var(--shadow-lg)",
        modal:        "var(--shadow-xl)",
        "inner-sm":   "inset 0 1px 2px 0 rgb(0 0 0 / 0.04)",
      },

      /* ── Animações ───────────────────────────────────────────────── */
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to:   { opacity: "0" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)", opacity: "0" },
          to:   { transform: "translateX(0)",   opacity: "1" },
        },
        "slide-out-right": {
          from: { transform: "translateX(0)",   opacity: "1" },
          to:   { transform: "translateX(100%)", opacity: "0" },
        },
        "scale-in": {
          from: { transform: "scale(0.95)", opacity: "0" },
          to:   { transform: "scale(1)",    opacity: "1" },
        },
        "drag-indicator-pulse": {
          "0%, 100%": { opacity: "1",   transform: "scaleY(1)" },
          "50%":      { opacity: "0.6", transform: "scaleY(1.5)" },
        },
      },
      animation: {
        "accordion-down":  "accordion-down 0.2s ease-out",
        "accordion-up":    "accordion-up 0.2s ease-out",
        "fade-in":         "fade-in 0.2s ease-out",
        "fade-out":        "fade-out 0.15s ease-in",
        "slide-in-right":  "slide-in-right 0.3s ease-out",
        "slide-out-right": "slide-out-right 0.25s ease-in",
        "scale-in":        "scale-in 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
