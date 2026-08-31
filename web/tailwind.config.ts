import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // "Muara" palette -- terinspirasi warna air payau, lumpur mangrove, dan cangkang kepiting
        bg: "#F2F6F2",
        surface: "#FFFFFF",
        ink: "#122B26",
        muted: "#5C7A72",
        border: "#DCE5DD",
        brand: {
          50: "#E6F3EF",
          100: "#C4E3D9",
          300: "#5FAE99",
          500: "#0E6E5C",
          600: "#0B5A4B",
          700: "#08453A",
          900: "#0A2620",
        },
        brass: {
          100: "#F4E3C4",
          300: "#DDAE64",
          500: "#C1873A",
          700: "#8E611F",
        },
        status: {
          aman: "#1F9D55",
          amanBg: "#E4F6EB",
          waspada: "#B9740E",
          waspadaBg: "#FBF0DA",
          bahaya: "#C23B22",
          bahayaBg: "#FBE7E2",
        },
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-jakarta)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(18,43,38,0.04), 0 4px 16px rgba(18,43,38,0.06)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      backgroundImage: {
        ripple:
          "radial-gradient(circle at 1px 1px, rgba(14,110,92,0.14) 1px, transparent 0)",
      },
    },
  },
  plugins: [],
};
export default config;
