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
        "bg-matte": "#0a0a0a",
        "bg-card": "#111",
        "accent-heart": "#f43f5e",
      },
    },
  },
  plugins: [],
};
export default config;
