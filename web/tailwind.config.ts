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
        // Warna dominan aplikasi: #19A8B2 (brand-500).
        //
        // Step 600/700 SENGAJA lebih gelap, bukan sekadar variasi: teks putih di
        // atas #19A8B2 hanya 2.88:1 — gagal WCAG AA (butuh 4.5:1) dan bahkan
        // gagal ambang 3:1 untuk komponen UI. Jadi #19A8B2 dipakai untuk isian
        // dan aksen (pil nav, logo, ikon), sedangkan tombol, wordmark, dan
        // outline fokus memakai 600/700 yang terukur lolos:
        //   putih di 600 = 4.52:1 · putih di 700 = 5.82:1 · 700 di 50 = 5.25:1
        brand: {
          50: "#E8F6F7",
          100: "#C6E9EC",
          300: "#7ACDD2",
          500: "#19A8B2",
          600: "#12838C",
          700: "#0F7078",
          900: "#0A3C41",
        },
        // Panel kiri halaman login sengaja mempertahankan hijau "Muara" yang
        // lama supaya menyatu dengan foto tambak. Dipisahkan dari `brand` justru
        // agar tidak ikut berubah kalau warna merek digeser lagi.
        hero: {
          deep: "#0A2620",
          soft: "#C4E3D9",
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
    },
  },
  plugins: [],
};
export default config;
