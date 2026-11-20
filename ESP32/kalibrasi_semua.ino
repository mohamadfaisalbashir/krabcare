/**
 * =============================================================================
 *  Kalibrasi Terpadu pH dan EC (Salinitas) - KrabCare
 * =============================================================================
 *
 *  Deskripsi:
 *    Satu sketsa untuk mengkalibrasi sensor pH (3 titik: 4.01, 6.86, 9.18)
 *    dan sensor EC (1 titik: larutan standar 12.88 mS/cm). Sketsa membaca
 *    tegangan sensor dengan cara yang sama seperti firmware utama (median
 *    filter 30 sampel), menampilkan nilai langsung (live) setiap 2 detik,
 *    dan menghitung konstanta kalibrasi lewat perintah dari Serial Monitor.
 *
 *  Penggunaan:
 *    - Serial Monitor: 115200 baud, line ending "Newline".
 *    - Ketik "bantuan" untuk melihat daftar perintah.
 *    - Konstanta hasil perhitungan langsung dipakai pada tampilan live
 *      (hanya di RAM) agar bisa diverifikasi, lalu salin ke firmware utama
 *      dan upload ulang firmware utama.
 *
 *  Perangkat keras (sama dengan firmware utama):
 *    - ESP32 DevKitC V4, DS18B20 (GPIO33), ADS1115 (SDA=21, SCL=22)
 *    - Sensor pH di ADS1115 kanal A0, sensor EC di ADS1115 kanal A1
 * =============================================================================
 */

#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <math.h>

// ----------------------------- Konfigurasi pin -------------------------------
#define ONE_WIRE_BUS 33
#define I2C_SDA_PIN  21
#define I2C_SCL_PIN  22
#define ADS_CH_PH     0
#define ADS_CH_EC     1

// ------------------- Konstanta kalibrasi awal (nilai saat ini) ---------------
// Isi dengan nilai yang sedang terpasang di firmware utama.
const float PH_SLOPE_AWAL  = -5.84f;
const float PH_OFFSET_AWAL = 15.70f;
const float EC_K_AWAL      = 0.03351f;

float PH_SLOPE  = PH_SLOPE_AWAL;    // dapat berubah lewat perintah (di RAM)
float PH_OFFSET = PH_OFFSET_AWAL;
float EC_K      = EC_K_AWAL;
const float EC_V0    = 0.0f;        // kalibrasi 1 titik
const float EC_ALPHA = 0.02f;       // koefisien suhu per derajat C

// ------------------------------ Larutan acuan --------------------------------
const float PH_REF[3]      = {4.01f, 6.86f, 9.18f};
const float EC_STD_DEFAULT = 12.88f;   // mS/cm

float phTegangan[3];                   // tegangan (V) hasil rekam tiap titik
bool  phTercatat[3] = {false, false, false};

// ------------------------------ Parameter baca -------------------------------
const int SAMPLE_COUNT   = 30;         // sampel ADC per satu kali baca (median)
const int JUMLAH_RATA    = 8;          // jumlah bacaan median yang dirata-ratakan saat merekam
const unsigned long INTERVAL_LIVE_MS = 2000UL;

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature ds18b20(&oneWire);
Adafruit_ADS1115 ads;

int16_t adcBuffer[SAMPLE_COUNT];
bool streaming = true;
unsigned long lastLiveMillis = 0;

// =============================================================================
// FUNGSI BACA SENSOR (sama dengan firmware utama)
// =============================================================================

/** Median dari array ADC mentah (insertion sort). */
int16_t getMedianValue(int16_t arr[], int len) {
  int16_t sorted[SAMPLE_COUNT];
  memcpy(sorted, arr, len * sizeof(int16_t));
  for (int i = 1; i < len; i++) {
    int16_t key = sorted[i];
    int j = i - 1;
    while (j >= 0 && sorted[j] > key) {
      sorted[j + 1] = sorted[j];
      j--;
    }
    sorted[j + 1] = key;
  }
  if (len % 2 == 0) return (sorted[len / 2] + sorted[len / 2 - 1]) / 2;
  return sorted[len / 2];
}

/** Tegangan (Volt) pada satu kanal ADS1115 dengan median filter. */
float bacaTeganganADS(uint8_t channel) {
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    adcBuffer[i] = ads.readADC_SingleEnded(channel);
    delay(5);
  }
  return ads.computeVolts(getMedianValue(adcBuffer, SAMPLE_COUNT));
}

/** Rata-rata dari beberapa bacaan median (dipakai saat merekam titik kalibrasi). */
float rataTegangan(uint8_t channel, int n) {
  float sum = 0.0f;
  for (int i = 0; i < n; i++) sum += bacaTeganganADS(channel);
  return sum / n;
}

/** Suhu air (C) dari DS18B20, atau NAN bila gagal setelah 3 percobaan. */
float bacaSuhu() {
  for (int i = 0; i < 3; i++) {
    ds18b20.requestTemperatures();
    float t = ds18b20.getTempCByIndex(0);
    if (t != DEVICE_DISCONNECTED_C && !isnan(t)) return t;
    delay(200);
  }
  return NAN;
}

/** Konversi EC pada suhu T (mS/cm) ke salinitas praktis (ppt), skala PSS-78. */
double salinityPSS78(double ecT, double T) {
  double R  = ecT / 42.914;
  double rt = (((1.0031e-9 * T - 6.9698e-7) * T + 1.104259e-4) * T + 2.00564e-2) * T + 0.6766097;
  double Rt = R / rt;
  if (Rt <= 0) return 0;
  double x = sqrt(Rt);
  double S  = 0.0080 + x * (-0.1692 + x * (25.3851 + x * (14.0941 + x * (-7.0261 + x * 2.7081))));
  double dS = (T - 15.0) / (1.0 + 0.0162 * (T - 15.0)) *
              (0.0005 + x * (-0.0056 + x * (-0.0066 + x * (-0.0375 + x * (0.0636 + x * -0.0144)))));
  return S + dS;
}

// =============================================================================
// TAMPILAN LIVE
// =============================================================================

/** Menampilkan bacaan langsung memakai konstanta kalibrasi yang sedang aktif. */
void tampilkanLive() {
  float t    = bacaSuhu();
  float vPh  = bacaTeganganADS(ADS_CH_PH);
  float vEc  = bacaTeganganADS(ADS_CH_EC);
  float mvEc = vEc * 1000.0f;

  float ph = PH_SLOPE * vPh + PH_OFFSET;   // tanpa clamp agar nilai aneh terlihat

  float tPakai = isnan(t) ? 25.0f : t;
  float ecT = EC_K * (mvEc - EC_V0);
  if (ecT < 0) ecT = 0;
  float ec25 = ecT / (1.0f + EC_ALPHA * (tPakai - 25.0f));
  float sal  = (ecT > 0.1f) ? (float)salinityPSS78(ecT, tPakai) : 0.0f;

  Serial.printf("V_pH=%.4f V | pH=%.2f | V_EC=%.1f mV | T=", vPh, ph, mvEc);
  if (isnan(t)) Serial.print("ERR(DS18B20)");
  else          Serial.printf("%.2f C", t);
  Serial.printf(" | EC25=%.3f mS/cm | Sal=%.2f ppt\n", ec25, sal);
}

// =============================================================================
// KALIBRASI pH (3 titik, regresi linear)
// =============================================================================

/** Merekam tegangan rata-rata untuk titik ke-idx (0=4.01, 1=6.86, 2=9.18). */
void rekamPH(int idx) {
  Serial.printf("Merekam pH %.2f ... (jangan geser probe, +-4 detik)\n", PH_REF[idx]);
  float v = rataTegangan(ADS_CH_PH, JUMLAH_RATA);
  phTegangan[idx] = v;
  phTercatat[idx] = true;
  Serial.printf("Tercatat: pH %.2f -> V = %.4f V\n", PH_REF[idx], v);
  Serial.println("Ketik 'phhitung' bila semua titik sudah direkam.");
}

void lihatPH() {
  for (int i = 0; i < 3; i++) {
    if (phTercatat[i]) Serial.printf("pH %.2f : V = %.4f V\n", PH_REF[i], phTegangan[i]);
    else               Serial.printf("pH %.2f : (belum direkam)\n", PH_REF[i]);
  }
}

/** Menghitung PH_SLOPE (m) dan PH_OFFSET (c) dengan kuadrat terkecil. */
void hitungPH() {
  int n = 0;
  double sv = 0, sp = 0, svv = 0, svp = 0;
  for (int i = 0; i < 3; i++) {
    if (!phTercatat[i]) continue;
    n++;
    sv  += phTegangan[i];
    sp  += PH_REF[i];
    svv += (double)phTegangan[i] * phTegangan[i];
    svp += (double)phTegangan[i] * PH_REF[i];
  }
  if (n < 2) {
    Serial.println("[ERROR] Minimal 2 titik pH harus direkam (ph4 / ph6 / ph9).");
    return;
  }
  double den = n * svv - sv * sv;
  if (fabs(den) < 1e-9) {
    Serial.println("[ERROR] Tegangan antar titik hampir sama, cek probe dan larutan.");
    return;
  }
  double m = (n * svp - sv * sp) / den;
  double c = (sp - m * sv) / n;

  Serial.println("=== HASIL KALIBRASI pH ===");
  Serial.printf("Jumlah titik : %d\n", n);
  for (int i = 0; i < 3; i++) {
    if (!phTercatat[i]) continue;
    double phHitung = m * phTegangan[i] + c;
    Serial.printf("  pH %.2f -> hitung %.3f (selisih %+.3f)\n",
                  PH_REF[i], phHitung, phHitung - PH_REF[i]);
  }
  if (m >= 0) Serial.println("[PERINGATAN] Slope bernilai positif (biasanya negatif), cek urutan larutan/probe.");
  Serial.println("Salin ke firmware utama:");
  Serial.printf("float PH_SLOPE  = %.4f;\n", m);
  Serial.printf("float PH_OFFSET = %.4f;\n", c);
  PH_SLOPE  = (float)m;      // dipakai pada tampilan live untuk verifikasi
  PH_OFFSET = (float)c;
  Serial.println("(Konstanta baru sudah aktif di tampilan live. Verifikasi dengan buffer 6.86.)");
}

// =============================================================================
// KALIBRASI EC (1 titik)
// =============================================================================

/** Menghitung EC_K dari larutan standar (mS/cm) yang sedang dicelup. */
void hitungEC(float ecStd) {
  Serial.printf("Merekam EC pada larutan %.2f mS/cm ... (+-4 detik)\n", ecStd);
  float mv = rataTegangan(ADS_CH_EC, JUMLAH_RATA) * 1000.0f;
  float t  = bacaSuhu();
  if (isnan(t)) {
    Serial.println("[PERINGATAN] DS18B20 tidak terbaca, suhu dianggap 25 C.");
    t = 25.0f;
  }
  if (mv < 5.0f) {
    Serial.println("[ERROR] Tegangan EC terlalu kecil, cek probe terendam/kabel/kanal A1.");
    return;
  }
  float k = ecStd * (1.0f + EC_ALPHA * (t - 25.0f)) / (mv - EC_V0);

  Serial.println("=== HASIL KALIBRASI EC ===");
  Serial.printf("V_EC = %.1f mV | T = %.2f C | EC_std = %.2f mS/cm\n", mv, t, ecStd);
  Serial.println("Salin ke firmware utama:");
  Serial.printf("const float EC_K = %.5ff;\n", k);
  EC_K = k;                  // dipakai pada tampilan live untuk verifikasi
  Serial.println("(EC_K baru sudah aktif di tampilan live. EC25 seharusnya mendekati nilai larutan.)");
}

// =============================================================================
// PERINTAH SERIAL
// =============================================================================

void tampilkanBantuan() {
  Serial.println();
  Serial.println("=== PERINTAH ===");
  Serial.println("ph4        : rekam tegangan pada buffer pH 4.01");
  Serial.println("ph6        : rekam tegangan pada buffer pH 6.86");
  Serial.println("ph9        : rekam tegangan pada buffer pH 9.18");
  Serial.println("phlihat    : tampilkan titik pH yang sudah direkam");
  Serial.println("phhitung   : hitung PH_SLOPE dan PH_OFFSET");
  Serial.println("phulang    : hapus semua titik pH");
  Serial.println("ec         : hitung EC_K (larutan standar 12.88 mS/cm)");
  Serial.println("ec <nilai> : hitung EC_K untuk larutan standar lain, mis. 'ec 1.413'");
  Serial.println("stop       : hentikan tampilan live");
  Serial.println("mulai      : lanjutkan tampilan live");
  Serial.println("reset      : kembalikan konstanta ke nilai awal");
  Serial.println("bantuan    : tampilkan daftar ini");
  Serial.println();
}

void prosesPerintah(String cmd) {
  cmd.trim();
  cmd.toLowerCase();
  if (cmd.length() == 0) return;

  if      (cmd == "ph4")      rekamPH(0);
  else if (cmd == "ph6")      rekamPH(1);
  else if (cmd == "ph9")      rekamPH(2);
  else if (cmd == "phlihat")  lihatPH();
  else if (cmd == "phhitung") hitungPH();
  else if (cmd == "phulang") {
    for (int i = 0; i < 3; i++) phTercatat[i] = false;
    Serial.println("Titik pH dihapus.");
  }
  else if (cmd.startsWith("ec")) {
    String arg = cmd.substring(2);
    arg.trim();
    float std = (arg.length() > 0) ? arg.toFloat() : EC_STD_DEFAULT;
    if (std <= 0) Serial.println("[ERROR] Nilai larutan standar tidak valid.");
    else          hitungEC(std);
  }
  else if (cmd == "stop")   { streaming = false; Serial.println("Live dihentikan."); }
  else if (cmd == "mulai")  { streaming = true;  Serial.println("Live dilanjutkan."); }
  else if (cmd == "reset") {
    PH_SLOPE = PH_SLOPE_AWAL;
    PH_OFFSET = PH_OFFSET_AWAL;
    EC_K = EC_K_AWAL;
    Serial.println("Konstanta dikembalikan ke nilai awal.");
  }
  else if (cmd == "bantuan") tampilkanBantuan();
  else Serial.println("Perintah tidak dikenal. Ketik 'bantuan'.");
}

// =============================================================================
// SETUP DAN LOOP
// =============================================================================

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(100);
  delay(500);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  ads.setGain(GAIN_ONE);                 // +-4.096 V
  if (!ads.begin()) {
    Serial.println("[ERROR] ADS1115 tidak terdeteksi! Cek SDA/SCL/alamat I2C.");
    while (true) delay(1000);
  }
  ds18b20.begin();

  Serial.println("\n=== KALIBRASI TERPADU pH + EC (KrabCare) ===");
  Serial.printf("Konstanta aktif: PH_SLOPE=%.4f, PH_OFFSET=%.4f, EC_K=%.5f\n",
                PH_SLOPE, PH_OFFSET, EC_K);
  tampilkanBantuan();
  lastLiveMillis = millis();
}

void loop() {
  if (Serial.available()) {
    prosesPerintah(Serial.readStringUntil('\n'));
  }
  if (streaming && millis() - lastLiveMillis >= INTERVAL_LIVE_MS) {
    lastLiveMillis = millis();
    tampilkanLive();
  }
}