import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        "text-1": "var(--text-1)",
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",
        brand: "var(--brand)",
        "brand-hover": "var(--brand-hover)",
        "brand-soft": "var(--brand-soft)",
        "risk-low": "var(--risk-low)",
        "risk-med": "var(--risk-med)",
        "risk-high": "var(--risk-high)",
        violet: "var(--violet)",
        cyan: "var(--cyan)",
        pink: "var(--pink)",
      },
      fontFamily: {
        head: ["var(--font-head)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      boxShadow: {
        rest: "var(--shadow-rest)",
        raised: "var(--shadow-raised)",
        glow: "var(--shadow-glow)",
      },
      backgroundImage: {
        "brand-gradient": "var(--brand-gradient)",
      },
    },
  },
} satisfies Config;
