import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // Aturan baru eslint-plugin-react-hooks 7. Yang kena semuanya pola yang
      // disengaja: ambil data lalu setState di effect, dan baca localStorage
      // atau kelas <html> setelah mount (token dan tema tidak ada di server).
      // Diturunkan ke peringatan supaya tetap kelihatan tanpa menggagalkan lint.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
