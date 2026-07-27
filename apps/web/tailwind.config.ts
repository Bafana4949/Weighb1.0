import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    fontSize: {
      "2xs": ["0.688rem", { lineHeight: "1.2" }],
      xs: ["0.75rem", { lineHeight: "1.3" }],
      sm: ["0.875rem", { lineHeight: "1.4" }],
      base: ["0.875rem", { lineHeight: "1.4" }],
      lg: ["1rem", { lineHeight: "1.4" }],
      xl: ["1.25rem", { lineHeight: "1.3" }],
      "2xl": ["2rem", { lineHeight: "1.2" }],
      "3xl": ["2.5rem", { lineHeight: "1.15" }]
    },
    borderRadius: {
      none: "0px",
      sm: "4px",
      DEFAULT: "4px",
      md: "4px",
      lg: "4px",
      xl: "4px",
      full: "9999px"
    },
    extend: {
      colors: {
        background: "rgb(var(--color-background) / <alpha-value>)",
        foreground: "rgb(var(--color-foreground) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        card: "rgb(var(--color-surface) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        "muted-foreground": "rgb(var(--color-muted-foreground) / <alpha-value>)",
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "primary-foreground": "rgb(var(--color-primary-foreground) / <alpha-value>)",
        accent: "rgb(var(--color-primary) / <alpha-value>)",
        "accent-foreground": "rgb(var(--color-primary-foreground) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        "success-foreground": "rgb(var(--color-success-foreground) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        "warning-foreground": "rgb(var(--color-warning-foreground) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        "danger-foreground": "rgb(var(--color-danger-foreground) / <alpha-value>)",
        destructive: "rgb(var(--color-danger) / <alpha-value>)",
        "destructive-foreground": "rgb(var(--color-danger-foreground) / <alpha-value>)"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "IBM Plex Sans", "sans-serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "Roboto Mono", "monospace"]
      },
      spacing: {
        "4.5": "18px"
      },
      boxShadow: { panel: "0 1px 2px rgba(17,24,39,0.04), 0 1px 3px rgba(17,24,39,0.08)" }
    }
  },
  plugins: []
} satisfies Config;
