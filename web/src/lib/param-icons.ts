import { Droplets, FlaskConical, Thermometer, type LucideIcon } from "lucide-react";
import type { ParamKey } from "./parameter";

/**
 * Ikon per parameter, satu sumber untuk seluruh aplikasi.
 *
 * Sengaja TIDAK ditaruh di PARAM_UI (lib/parameter.ts): berkas itu murni
 * TypeScript tanpa React, dan parameter.test.ts mengimpornya sebagai value
 * import di bawah `node --test`. Menyeret lucide-react ke sana akan memaksa
 * test runner me-resolve React tanpa alasan.
 *
 * Nilainya menyalin pemetaan yang sudah dipakai ParameterStrip, PredictionPanel,
 * dan PondCard — ketiganya sudah sepakat, ini hanya memberi mereka satu rumah.
 */
export const PARAM_ICON: Record<ParamKey, LucideIcon> = {
  ph: FlaskConical,
  temperature_c: Thermometer,
  salinity_ppt: Droplets,
};
