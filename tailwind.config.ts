import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "bg-deep": "#030303",
        "bg-matte": "#0a0a0a",
        "bg-card": "#111",
        "glass-surface": "rgba(255, 255, 255, 0.03)",
        "accent-heart": "#f43f5e",
        "accent-glow": "#fb7185", // Lighter pink for glows
        "quant-blue": "#0ea5e9",
        "success-green": "#10b981",
        border: "var(--border)",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
