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
        // Namanya masih "muted", warnanya TIDAK lagi abu-abu. #5C7A72 yang lama
        // hanya 4,69:1 di atas putih, lolos AA di atas kertas, tapi 52 tempat
        // memakainya dan sebagian besar duduk di atas kartu `.glass` (putih 55%
        // di atas foto), sehingga kontras efektifnya turun lagi dan teksnya
        // terbaca pudar. #1E332D = 13,4:1, praktis hitam, dan tetap sehelai
        // lebih terang dari `ink` (15,0:1) supaya angka & judul tetap yang
        // paling pekat di layar.
        //
        // Hirarki sekarang dibawa UKURAN dan TEBAL huruf, bukan kepudaran.
        // Jangan mengembalikannya jadi abu-abu untuk "menenangkan" tampilan.
        // Tiga pemakaian non-teks di globals.css (placeholder & dua garis bawah)
        // sudah diturunkan alpha-nya supaya tampilannya tidak ikut menggelap.
        muted: "#1E332D",
        border: "#DCE5DD",
        // Warna dominan aplikasi: #19A8B2 (brand-500).
        //
        // Step 600/700 SENGAJA lebih gelap, bukan sekadar variasi: teks putih di
        // atas #19A8B2 hanya 2.88:1, gagal WCAG AA (butuh 4.5:1) dan bahkan
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
      // WinUI 3 memakai SATU keluarga huruf untuk seluruh UI, judul dan isi.
      // Ini font bawaan sistem, bukan Google Font, jadi tidak ada yang diunduh:
      // Segoe UI Variable di Windows, dan system-ui menutup OS lain.
      fontFamily: {
        display: ['"Segoe UI Variable Display"', '"Segoe UI"', "system-ui", "sans-serif"],
        sans: ['"Segoe UI Variable Text"', '"Segoe UI"', "system-ui", "sans-serif"],
        // Nilai sensor tetap monospace. Pilihan monospace bukan ciri WinUI dan
        // fontnya sudah dimuat, jadi tidak ada alasan menggantinya.
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      boxShadow: {
        // WinUI menaruh kedalaman pada garis 1px, bukan pada bayangan yang
        // menyebar. Bayangan tipis ini hanya untuk memisahkan kartu dari panel.
        card: "0 1px 2px rgba(18,43,38,0.05)",
        // Satu tingkat di atas `card`, untuk elemen yang memang MELAYANG di atas
        // sesuatu: kartu rak di atas foto banner dan kartu grafik di halaman
        // detail. Nilainya disalin dari bayangan kustom yang sebelumnya ditulis
        // langsung di PondCard, supaya keduanya tidak lepas sinkron lagi.
        float: "0 2px 12px rgba(18,43,38,0.10)",
        floatHover: "0 6px 20px rgba(18,43,38,0.14)",
      },
      // SATU kurva untuk semua gerakan yang mengubah tata letak (lebar sidebar,
      // label yang menyusut, submenu yang membuka, indikator segmented control).
      // Sebelumnya tiap elemen memakai durasi & kurva sendiri, itu yang membuat
      // buka/tutup sidebar terbaca patah-patah, bukan durasinya yang kurang.
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        // `both` supaya elemen ber-delay tidak berkedip terlihat penuh dulu
        // sebelum gilirannya tiba.
        rise: "rise 420ms cubic-bezier(0.32, 0.72, 0, 1) both",
      },
      borderRadius: {
        // Dua radius standar WinUI 3. `lg` SENGAJA menimpa bawaan Tailwind
        // (0.5rem): 26 pemakaian rounded-lg, tombol, input, item nav, ubin
        // ikon, ikut jadi 4px tanpa satu pun berkas TSX disentuh.
        lg: "0.25rem",
        xl2: "0.5rem",
      },
    },
  },
  plugins: [],
};
export default config;
