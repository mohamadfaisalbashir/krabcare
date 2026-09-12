import { Droplets, FlaskConical, Thermometer, Wind, type LucideIcon } from "lucide-react";
import type { ParamKey } from "./parameter";

/**
 * Ikon per parameter, satu sumber untuk ParameterStrip, PredictionPanel, dan
 * PondCard. Bukan di PARAM_UI (lib/parameter.ts): berkas itu murni TypeScript
 * tanpa React supaya bisa dimuat `node --test`.
 */
export const PARAM_ICON: Record<ParamKey, LucideIcon> = {
  ph: FlaskConical,
  temperature_c: Thermometer,
  salinity_ppt: Droplets,
};

/** Amonia di luar PARAM_ICON karena bukan ParamKey (lib/ammonia.ts).
 *  Memasukkannya akan melebarkan tipe dan menyeret amonia ke grafik & ekspor. */
export const AMONIA_ICON: LucideIcon = Wind;
