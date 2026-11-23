import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        berlin: {
          bg: "#09090b",
          card: "#121217",
          accent: "#a3e635",
          alert: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};
export default config;
