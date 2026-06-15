import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        roseglass: "rgba(255,255,255,0.08)"
      },
      boxShadow: {
        glow: "0 0 40px rgba(139, 92, 246, 0.22)"
      }
    }
  },
  plugins: []
};

export default config;
