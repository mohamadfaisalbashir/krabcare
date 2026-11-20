/**
 * =============================================================================
 *  Firmware Node Master - Sistem Monitoring Kualitas Air Budidaya Kepiting
 *  (KrabCare) - VERSI FINAL (sensor + penerima ESP-NOW dari slave)
 * =============================================================================
 *
 *  Deskripsi:
 *    ESP32 master membaca suhu, pH, dan salinitas satu kolam, sekaligus
 *    menerima data node slave via ESP-NOW, lalu meneruskan semuanya ke
 *    Raspberry Pi (Master Pi) melalui UART (Serial2).
 *
 *  Alur kerja utama:
 *    1. Setiap SAMPLE_INTERVAL_MS (5 detik) sensor dibaca, disimpan ke buffer
 *       sirkular (12 sampel/menit), dan LCD diperbarui.
 *    2. Setiap SEND_INTERVAL_MS (60 detik) buffer dirata-ratakan lalu dikirim
 *       ke Raspi dalam format JSON.
 *    3. Paket ESP-NOW dari slave ditaruh di antrian oleh callback, lalu
 *       diteruskan ke Raspi dari loop utama.
 *
 *  Perubahan pada versi final ini:
 *    - Deteksi sensor pH/EC rusak lewat tegangan keluaran tidak wajar
 *      (terlalu dekat 0 V / melewati batas datasheet) -> NaN, tidak di-clamp.
 *    - ADS1115 dicek setiap sampel dan di-init ulang otomatis jika kembali.
 *    - Rata-rata per menit sah jika sampel valid >= MIN_VALID_SAMPLES.
 *    - Payload JSON hanya memuat parameter valid (field NaN dihilangkan).
 *      Dikirim selama minimal satu parameter valid. Berlaku sama untuk data
 *      master sendiri maupun paket slave yang diteruskan.
 *    - Watchdog (Task WDT): restart otomatis jika loop() macet.
 *    - Penyebab restart dicatat di Serial, LCD, dan paket event ke Raspi.
 *
 *  Format paket ke Raspberry Pi (satu baris JSON per paket):
 *    Data sensor : {"id":"A1B2C3D4E5F6","suhu":28.40,"ph":8.01,"salinitas":19.20}
 *    pH rusak    : {"id":"A1B2C3D4E5F6","suhu":28.40,"salinitas":19.20}
 *    Event boot  : {"id":"A1B2C3D4E5F6","event":"boot","reset_reason":"TASK_WDT"}
 *
 *  Catatan untuk sisi Raspberry Pi:
 *    - Gunakan data.get("ph") dst. (bukan data["ph"]); None = sensor tidak terbaca.
 *    - Paket yang memiliki key "event" BUKAN data sensor.
 *
 *  Catatan penting:
 *    - PH_SLOPE / PH_OFFSET masih PLACEHOLDER; kalibrasi ulang (buffer 4.01 & 6.86).
 *    - EC_K hasil kalibrasi 1 titik pada larutan 12.88 mS/cm.
 *    - Salinitas dari EC memakai PSS-78 (akurat untuk 2-42 ppt).
 *    - Batas tegangan fault adalah nilai awal dari datasheet; verifikasi dengan
 *      probe terendam dan probe dilepas (lihat Vph/Vec pada Serial Monitor).
 *    - ESP-NOW: kanal dikunci ke ESPNOW_CHANNEL, HARUS sama dengan slave.
 *    - Struktur SensorPacket HARUS identik dengan firmware slave. Slave hanya
 *      menandai parameter valid lewat bitmask "valid" dan mengirim paket
 *      event boot (type 1) berisi alasan restart.
 * =============================================================================
 */

#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_ADS1X15.h>
#include <math.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <esp_idf_version.h>

// =============================================================================
// KONFIGURASI PIN
// =============================================================================

#define ONE_WIRE_BUS   33   ///< Pin data DS18B20
#define I2C_SDA_PIN    21   ///< SDA (ADS1115 dan LCD)
#define I2C_SCL_PIN    22   ///< SCL (ADS1115 dan LCD)

// =============================================================================
// KONFIGURASI ADS1115
// =============================================================================

#define ADS_I2C_ADDRESS 0x48
#define ADS_CH_PH       0   ///< Sensor pH di A0
#define ADS_CH_EC       1   ///< Sensor EC di A1

// =============================================================================
// BATAS DETEKSI SENSOR RUSAK (tegangan keluaran, Volt)
// =============================================================================
// Datasheet: pH output 0~3.0 V, TDS/EC output 0~3.2 V.
// Batas bawah: probe lepas / kabel putus cenderung ~0 V.
// Batas atas : sedikit di atas maksimum datasheet.
// ADS1115 disuplai 5 V dengan GAIN_ONE (maks. terbaca 4.096 V), sehingga
// tegangan di atas batas atas masih bisa terbaca dan terdeteksi sebagai fault.

const float PH_V_MIN = 0.10f;
const float PH_V_MAX = 3.10f;
const float EC_V_MIN = 0.005f;
const float EC_V_MAX = 3.30f;

// =============================================================================
// KALIBRASI SENSOR pH
// =============================================================================

float PH_SLOPE  = -5.7766f;   // PLACEHOLDER, kalibrasi ulang
float PH_OFFSET = 15.4745f;   // PLACEHOLDER, kalibrasi ulang

// =============================================================================
// KALIBRASI SENSOR EC
// =============================================================================

const float EC_K     = 0.03351f;  // mS/cm per mV (kalibrasi 1 titik 12.88 mS/cm)
const float EC_V0    = 0.0f;
const float EC_ALPHA = 0.02f;

// =============================================================================
// LCD I2C
// =============================================================================

#define LCD_I2C_ADDRESS 0x27
#define LCD_COLS        20
#define LCD_ROWS         4

// =============================================================================
// INTERVAL
// =============================================================================

const unsigned long SAMPLE_INTERVAL_MS = 5000UL;
const unsigned long SEND_INTERVAL_MS   = 60000UL;
const int SAMPLES_PER_SEND = SEND_INTERVAL_MS / SAMPLE_INTERVAL_MS;  // 12

// Minimum sampel valid per menit agar rata-rata dianggap sah (6 dari 12).
const int MIN_VALID_SAMPLES = SAMPLES_PER_SEND / 2;

unsigned long lastSampleMillis = 0;
unsigned long lastSendMillis   = 0;

// =============================================================================
// WATCHDOG
// =============================================================================
// Satu putaran ambilSampel() bisa ~3.5 detik pada kasus terburuk (retry DS18B20
// + 30 sampel ADC x 2 channel). 20 detik cukup longgar tanpa restart palsu,
// tetapi tetap cepat menangkap program yang hang.

#define WDT_TIMEOUT_S 20

// =============================================================================
// KONFIGURASI ESP-NOW
// =============================================================================

#define ESPNOW_CHANNEL 1   ///< Kanal radio ESP-NOW, HARUS sama dengan slave

/**
 * Struktur paket dari node slave. Urutan dan tipe field HARUS identik dengan
 * firmware slave.
 *  - type 0 = data sensor. Hanya field yang bit-nya aktif di "valid" yang
 *    dipakai; field lain diabaikan (slave sudah menyaring data NaN).
 *  - type 1 = event boot. Alasan restart slave ada di "reason".
 */
#define PKT_TYPE_DATA  0
#define PKT_TYPE_BOOT  1
#define VALID_SUHU     0x01
#define VALID_PH       0x02
#define VALID_SAL      0x04

typedef struct __attribute__((packed)) {
  uint8_t type;       ///< PKT_TYPE_DATA atau PKT_TYPE_BOOT
  char    id[13];     ///< Chip ID slave (12 hex + null)
  uint8_t valid;      ///< Bitmask parameter valid (VALID_*)
  float   suhu;       ///< Suhu rata-rata (°C)
  float   ph;         ///< pH rata-rata
  float   salinitas;  ///< Salinitas rata-rata (ppt)
  char    reason[12]; ///< Alasan restart slave (hanya untuk type BOOT)
} SensorPacket;

const int RX_QUEUE_SIZE = 8;
volatile SensorPacket rxQueue[RX_QUEUE_SIZE];
volatile int rxHead = 0;   ///< Indeks tulis (callback)
volatile int rxTail = 0;   ///< Indeks baca (loop utama)

// =============================================================================
// OBJEK DAN VARIABEL GLOBAL
// =============================================================================

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature ds18b20(&oneWire);
LiquidCrystal_I2C lcd(LCD_I2C_ADDRESS, LCD_COLS, LCD_ROWS);

Adafruit_ADS1115 ads;
bool adsReady = false;

String deviceID = "";
String resetReasonStr = "";

// =============================================================================
// BUFFER SAMPLING
// =============================================================================

const int SAMPLE_COUNT = 30;
int16_t   adcBuffer[SAMPLE_COUNT];

float bufSuhu[SAMPLES_PER_SEND];
float bufPH[SAMPLES_PER_SEND];
float bufEC[SAMPLES_PER_SEND];
float bufSalinitas[SAMPLES_PER_SEND];

int sampleIndex  = 0;
int sampleFilled = 0;

// =============================================================================
// NILAI RATA-RATA YANG DIKIRIM
// =============================================================================

float suhuC       = NAN;
float ecValue     = NAN;
float salinityPpt = NAN;
float phValue     = NAN;

// =============================================================================
// WATCHDOG & PENYEBAB RESTART
// =============================================================================

String resetReasonToString(esp_reset_reason_t r) {
  switch (r) {
    case ESP_RST_POWERON:   return "POWERON";
    case ESP_RST_EXT:       return "EXT_PIN";
    case ESP_RST_SW:        return "SOFTWARE";
    case ESP_RST_PANIC:     return "PANIC";
    case ESP_RST_INT_WDT:   return "INT_WDT";
    case ESP_RST_TASK_WDT:  return "TASK_WDT";
    case ESP_RST_WDT:       return "WDT";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP";
    case ESP_RST_BROWNOUT:  return "BROWNOUT";
    case ESP_RST_SDIO:      return "SDIO";
    default:                return "UNKNOWN";
  }
}

/**
 * Mengaktifkan Task Watchdog untuk memantau loop(). Jika esp_task_wdt_reset()
 * tidak dipanggil dalam WDT_TIMEOUT_S detik, ESP32 panic lalu restart.
 * Mendukung Arduino-ESP32 core 2.x (IDF 4) dan 3.x (IDF 5).
 */
void initWatchdog() {
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
  esp_task_wdt_config_t cfg = {
    .timeout_ms     = WDT_TIMEOUT_S * 1000,
    .idle_core_mask = 0,       // hanya pantau loop task, bukan idle task
    .trigger_panic  = true     // panic lalu restart otomatis
  };
  if (esp_task_wdt_reconfigure(&cfg) == ESP_ERR_INVALID_STATE) {
    esp_task_wdt_init(&cfg);
  }
#else
  esp_task_wdt_init(WDT_TIMEOUT_S, true);
#endif
  esp_task_wdt_add(NULL);      // daftarkan loop task
  Serial.print("[INFO] Watchdog aktif, timeout ");
  Serial.print(WDT_TIMEOUT_S);
  Serial.println(" detik.");
}

// =============================================================================
// FUNGSI UTILITAS
// =============================================================================

int16_t getMedianValue(int16_t arr[], int len) {
  int16_t sorted[len];
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

  if (len % 2 == 0) {
    return (sorted[len / 2] + sorted[len / 2 - 1]) / 2;
  } else {
    return sorted[len / 2];
  }
}

float bacaSuhu() {
  const int MAX_RETRY = 3;

  for (int attempt = 1; attempt <= MAX_RETRY; attempt++) {
    ds18b20.requestTemperatures();
    float t = ds18b20.getTempCByIndex(0);

    // 85 °C = nilai awal DS18B20 sebelum konversi selesai (bukan suhu air sebenarnya)
    if (t != DEVICE_DISCONNECTED_C && !isnan(t) && fabsf(t - 85.0f) > 0.01f) {
      if (attempt > 1) {
        Serial.print("[INFO] DS18B20 berhasil dibaca setelah retry ke-");
        Serial.println(attempt);
      }
      return t;
    }

    Serial.print("[WARNING] DS18B20 gagal dibaca (percobaan ");
    Serial.print(attempt);
    Serial.print("/");
    Serial.print(MAX_RETRY);
    Serial.println("), mencoba ulang...");

    delay(200);
  }

  Serial.println("[ERROR] DS18B20 gagal setelah semua retry, cek wiring/pull-up resistor!");
  return NAN;
}

/**
 * Cek keberadaan ADS1115 di bus I2C setiap sampel. Jika sebelumnya hilang lalu
 * muncul kembali, ADS diinisialisasi ulang otomatis.
 */
bool cekADS() {
  Wire.beginTransmission(ADS_I2C_ADDRESS);
  bool ada = (Wire.endTransmission() == 0);

  if (!ada) {
    if (adsReady) Serial.println("[ERROR] ADS1115 hilang dari bus I2C!");
    adsReady = false;
    return false;
  }

  if (!adsReady) {
    if (ads.begin(ADS_I2C_ADDRESS, &Wire)) {
      ads.setGain(GAIN_ONE);
      adsReady = true;
      Serial.println("[OK] ADS1115 terdeteksi kembali.");
    }
  }
  return adsReady;
}

float bacaTeganganADS(uint8_t channel) {
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    adcBuffer[i] = ads.readADC_SingleEnded(channel);
    delay(5);
  }

  int16_t medianRaw = getMedianValue(adcBuffer, SAMPLE_COUNT);
  return ads.computeVolts(medianRaw);
}

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

/**
 * Membaca EC25 (mS/cm). NAN jika tegangan sensor di luar rentang wajar
 * (probe lepas/rusak/modul bermasalah).
 */
float bacaEC(float suhuKompensasi, float &teganganEC) {
  teganganEC = bacaTeganganADS(ADS_CH_EC);

  if (teganganEC < EC_V_MIN || teganganEC > EC_V_MAX) {
    return NAN;
  }

  float mv = teganganEC * 1000.0f;
  float ecT = EC_K * (mv - EC_V0);
  if (ecT < 0) ecT = 0;

  return ecT / (1.0f + EC_ALPHA * (suhuKompensasi - 25.0f));
}

/**
 * Membaca pH. NAN jika tegangan sensor di luar rentang wajar, atau jika hasil
 * konversi di luar 0-14 (tidak di-clamp).
 */
float bacaPH(float &teganganPH) {
  teganganPH = bacaTeganganADS(ADS_CH_PH);

  if (teganganPH < PH_V_MIN || teganganPH > PH_V_MAX) {
    return NAN;
  }

  float ph = (PH_SLOPE * teganganPH) + PH_OFFSET;

  if (ph < 0.0f || ph > 14.0f) {
    return NAN;
  }
  return ph;
}

/**
 * Rata-rata buffer dengan mengabaikan NaN. NAN jika sampel valid < minValid.
 */
float rataRataBuffer(float arr[], int len, int minValid) {
  float sum = 0.0;
  int count = 0;
  for (int i = 0; i < len; i++) {
    if (!isnan(arr[i])) {
      sum += arr[i];
      count++;
    }
  }
  if (count < minValid || count == 0) return NAN;
  return sum / count;
}

String dapatkanChipID() {
  uint64_t chipRaw = ESP.getEfuseMac();
  char idBuffer[13];

  snprintf(idBuffer, sizeof(idBuffer), "%04X%08X",
           (uint16_t)(chipRaw >> 32), (uint32_t)chipRaw);

  return String(idBuffer);
}

// =============================================================================
// TAMPILAN LCD
// =============================================================================

void lcdPrintLine(int row, String text) {
  while (text.length() < LCD_COLS) text += " ";
  if (text.length() > LCD_COLS) text = text.substring(0, LCD_COLS);
  lcd.setCursor(0, row);
  lcd.print(text);
}

/**
 * Tampilkan nilai sesaat. Parameter NaN ditampilkan sebagai "ERR".
 */
void tampilkanLCDRealtime(float s, float ph, float salinitas) {
  lcdPrintLine(0, "ID : " + deviceID);
  lcdPrintLine(1, "Suhu : " + (isnan(s)         ? String("ERROR") : String(s, 1) + " C"));
  lcdPrintLine(2, "pH   : " + (isnan(ph)        ? String("ERROR") : String(ph, 2)));
  lcdPrintLine(3, "Sal  : " + (isnan(salinitas) ? String("ERROR") : String(salinitas, 2) + " ppt"));
}

// =============================================================================
// KOMUNIKASI KE RASPBERRY PI (UART)
// =============================================================================

/**
 * True jika sedikitnya satu parameter bernilai valid (bukan NaN/Inf).
 */
bool adaNilaiValid(float s, float ph, float sal) {
  return isfinite(s) || isfinite(ph) || isfinite(sal);
}

/**
 * Membangun payload JSON yang hanya memuat parameter valid. Dipakai bersama
 * oleh data master dan data slave yang diteruskan.
 */
String bangunPayload(const String &id, float s, float ph, float sal) {
  String payload = "{\"id\":\"" + id + "\"";
  if (isfinite(s))   payload += ",\"suhu\":"      + String(s, 2);
  if (isfinite(ph))  payload += ",\"ph\":"        + String(ph, 2);
  if (isfinite(sal)) payload += ",\"salinitas\":" + String(sal, 2);
  payload += "}";
  return payload;
}

/**
 * Kirim data sensor master sendiri (rata-rata 1 menit) ke Raspi.
 */
void kirimDataUART() {
  String payload = bangunPayload(deviceID, suhuC, phValue, salinityPpt);
  Serial2.println(payload);
  Serial.println("[UART] " + payload);
}

/**
 * Kirim paket slave ke Raspi. Field NaN dihilangkan; jika seluruhnya NaN,
 * paket tidak diteruskan.
 */
void kirimPaketSlaveUART(const SensorPacket &pkt) {
  // Hanya field yang ditandai valid oleh slave yang dipakai
  float s   = (pkt.valid & VALID_SUHU) ? pkt.suhu      : NAN;
  float ph  = (pkt.valid & VALID_PH)   ? pkt.ph        : NAN;
  float sal = (pkt.valid & VALID_SAL)  ? pkt.salinitas : NAN;

  if (!adaNilaiValid(s, ph, sal)) {
    Serial.print("[WARNING] Paket slave ");
    Serial.print(pkt.id);
    Serial.println(" tanpa parameter valid, tidak diteruskan.");
    return;
  }

  String payload = bangunPayload(String(pkt.id), s, ph, sal);
  Serial2.println(payload);
  Serial.println("[UART] Teruskan data slave: " + payload);
}

/**
 * Kirim paket event (tanpa field sensor) ke Raspi. Raspi membedakannya lewat
 * key "event".
 */
void kirimEventUART(const String &id, const String &event, const String &extraKey = "", const String &extraVal = "") {
  String payload = "{\"id\":\"" + id + "\",\"event\":\"" + event + "\"";
  if (extraKey.length() > 0) payload += ",\"" + extraKey + "\":\"" + extraVal + "\"";
  payload += "}";
  Serial2.println(payload);
  Serial.println("[UART] " + payload);
}

// =============================================================================
// ESP-NOW (PENERIMA DATA SLAVE)
// =============================================================================

/**
 * Callback penerimaan ESP-NOW. Hanya menyalin paket ke antrian sirkular
 * (tanpa operasi lambat). Paket berukuran tidak sesuai diabaikan, dan paket
 * dibuang jika antrian penuh.
 */
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
#else
void onDataRecv(const uint8_t *mac, const uint8_t *data, int len) {
#endif
  if (len != sizeof(SensorPacket)) return;

  int next = (rxHead + 1) % RX_QUEUE_SIZE;
  if (next == rxTail) return;

  memcpy((void *)&rxQueue[rxHead], data, sizeof(SensorPacket));
  rxHead = next;
}

/**
 * Proses seluruh paket pada antrian ESP-NOW, lalu teruskan ke Raspi (field NaN
 * dihilangkan). Dipanggil dari loop utama.
 */
void prosesAntrianESPNow() {
  while (rxTail != rxHead) {
    SensorPacket pkt;
    memcpy(&pkt, (const void *)&rxQueue[rxTail], sizeof(SensorPacket));
    rxTail = (rxTail + 1) % RX_QUEUE_SIZE;
    pkt.id[sizeof(pkt.id) - 1] = '\0';
    pkt.reason[sizeof(pkt.reason) - 1] = '\0';

    if (pkt.type == PKT_TYPE_BOOT) {
      Serial.print("[ESP-NOW] Boot slave ");
      Serial.print(pkt.id);
      Serial.print(" reset_reason=");
      Serial.println(pkt.reason);
      kirimEventUART(String(pkt.id), "boot", "reset_reason", String(pkt.reason));
      continue;
    }

    Serial.print("[ESP-NOW] Dari ");
    Serial.print(pkt.id);
    Serial.print(" valid=0x"); Serial.println(pkt.valid, HEX);

    kirimPaketSlaveUART(pkt);
  }
}

/**
 * Inisialisasi ESP-NOW sebagai penerima: WiFi mode station (tanpa router),
 * kunci kanal ke ESPNOW_CHANNEL, daftarkan callback penerimaan.
 */
bool inisialisasiESPNow() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  esp_wifi_set_promiscuous(true);
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);

  if (esp_now_init() != ESP_OK) {
    Serial.println("[ERROR] esp_now_init gagal.");
    return false;
  }

  esp_now_register_recv_cb(onDataRecv);
  return true;
}

// =============================================================================
// SAMPLING
// =============================================================================

void ambilSampel() {
  float s = bacaSuhu();
  float suhuKomp = isnan(s) ? 25.0f : s;   // fallback kompensasi jika suhu gagal

  float ec = NAN, ph = NAN, sal = NAN;
  float vEc = 0.0, vPh = 0.0;

  if (cekADS()) {
    ec = bacaEC(suhuKomp, vEc);
    ph = bacaPH(vPh);

    if (!isnan(ec)) {
      sal = (ec > 0.1f) ? (float)salinityPSS78(ec, suhuKomp) : 0.0f;
    }
  }

  bufSuhu[sampleIndex]      = s;
  bufEC[sampleIndex]        = ec;
  bufPH[sampleIndex]        = ph;
  bufSalinitas[sampleIndex] = sal;

  Serial.print("[SAMPLE ");
  Serial.print(sampleIndex + 1);
  Serial.print("/");
  Serial.print(SAMPLES_PER_SEND);
  Serial.print("] ID="); Serial.print(deviceID);
  Serial.print(" Suhu="); Serial.print(s, 2);
  Serial.print(" EC25="); Serial.print(ec, 3);
  Serial.print(" Sal="); Serial.print(sal, 2);
  Serial.print(" pH="); Serial.print(ph, 2);
  Serial.print(" | Vph="); Serial.print(vPh, 3);
  Serial.print(" Vec="); Serial.println(vEc, 3);

  sampleIndex++;
  if (sampleFilled < SAMPLES_PER_SEND) sampleFilled++;
  if (sampleIndex >= SAMPLES_PER_SEND) sampleIndex = 0;

  tampilkanLCDRealtime(s, ph, sal);
}

// =============================================================================
// SETUP
// =============================================================================

void setup() {
  Serial.begin(115200);
  Serial2.begin(115200, SERIAL_8N1, 16, 17);  // RX2=16, TX2=17, ke Raspberry Pi
  delay(1000);

  // Catat penyebab restart sedini mungkin
  resetReasonStr = resetReasonToString(esp_reset_reason());

  deviceID = dapatkanChipID();
  Serial.println("=== Sismon Kepiting (Master, final) ===");
  Serial.print("[INFO] Device ID    : ");
  Serial.println(deviceID);
  Serial.print("[INFO] Reset reason : ");
  Serial.println(resetReasonStr);

  ds18b20.begin();

  // Dummy read untuk "memanaskan" bus OneWire
  Serial.println("[INFO] Melakukan dummy read DS18B20...");
  ds18b20.requestTemperatures();
  delay(800);
  float dummyTemp = ds18b20.getTempCByIndex(0);
  if (dummyTemp == DEVICE_DISCONNECTED_C) {
    Serial.println("[WARNING] Dummy read gagal, sensor mungkin belum stabil.");
  } else {
    Serial.print("[INFO] Dummy read berhasil: ");
    Serial.print(dummyTemp);
    Serial.println(" C");
  }

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

  ads.setGain(GAIN_ONE);
  if (!ads.begin(ADS_I2C_ADDRESS, &Wire)) {
    Serial.println("[ERROR] ADS1115 tidak terdeteksi! Akan dicek ulang tiap sampel.");
    adsReady = false;
  } else {
    adsReady = true;
    Serial.println("[OK] ADS1115 terdeteksi.");
  }

  lcd.init();
  lcd.backlight();
  lcdPrintLine(0, "KrabCare Master");
  lcdPrintLine(1, "ID : " + deviceID);

  // Inisialisasi ESP-NOW (penerima data slave). MAC station master dicetak
  // untuk mengisi receiverMAC pada firmware slave.
  bool espNowOk = inisialisasiESPNow();
  Serial.print("[INFO] MAC (STA) master : ");
  Serial.println(WiFi.macAddress());
  if (espNowOk) {
    Serial.print("[OK] ESP-NOW siap, kanal ");
    Serial.println(ESPNOW_CHANNEL);
  }
  lcdPrintLine(2, espNowOk ? "ESP-NOW OK" : "ESP-NOW ERROR");
  lcdPrintLine(3, "R: " + resetReasonStr);

  Serial.print("Sampling tiap ");
  Serial.print(SAMPLE_INTERVAL_MS / 1000);
  Serial.print(" detik, kirim rata-rata tiap ");
  Serial.print(SEND_INTERVAL_MS / 1000);
  Serial.print(" detik (min sampel valid: ");
  Serial.print(MIN_VALID_SAMPLES);
  Serial.println(").");

  if (ds18b20.getDeviceCount() == 0) {
    Serial.println("[ERROR] DS18B20 tidak terdeteksi. Cek wiring & pull-up resistor!");
  }

  // Beri tahu Raspi bahwa ESP32 baru boot beserta penyebabnya
  kirimEventUART(deviceID, "boot", "reset_reason", resetReasonStr);

  delay(2500);   // tampilkan layar boot (termasuk reset reason) sebentar

  lastSampleMillis = millis();
  lastSendMillis   = millis();

  // Aktifkan watchdog paling akhir, setelah seluruh inisialisasi selesai
  initWatchdog();
}

// =============================================================================
// LOOP UTAMA
// =============================================================================

void loop() {
  unsigned long now = millis();

  // ---------- Teruskan paket ESP-NOW dari slave ke Raspberry Pi ----------
  prosesAntrianESPNow();

  // ---------- Ambil sampel sensor + perbarui LCD ----------
  if (now - lastSampleMillis >= SAMPLE_INTERVAL_MS) {
    lastSampleMillis = now;
    ambilSampel();
  }

  // ---------- Hitung rata-rata & kirim data master ke Raspberry Pi ----------
  if (now - lastSendMillis >= SEND_INTERVAL_MS) {
    lastSendMillis = now;

    suhuC       = rataRataBuffer(bufSuhu,      sampleFilled, MIN_VALID_SAMPLES);
    ecValue     = rataRataBuffer(bufEC,        sampleFilled, MIN_VALID_SAMPLES);
    phValue     = rataRataBuffer(bufPH,        sampleFilled, MIN_VALID_SAMPLES);
    salinityPpt = rataRataBuffer(bufSalinitas, sampleFilled, MIN_VALID_SAMPLES);

    Serial.println("=== RATA-RATA 1 MENIT ===");
    Serial.print("Device ID     : "); Serial.println(deviceID);
    Serial.print("Suhu avg      : "); Serial.println(isnan(suhuC)       ? "ERR" : String(suhuC, 2) + " C");
    Serial.print("EC25 avg      : "); Serial.println(isnan(ecValue)     ? "ERR" : String(ecValue, 3) + " mS/cm");
    Serial.print("Salinitas avg : "); Serial.println(isnan(salinityPpt) ? "ERR" : String(salinityPpt, 2) + " ppt");
    Serial.print("pH avg        : "); Serial.println(isnan(phValue)     ? "ERR" : String(phValue, 2));

    // Kirim selama minimal satu parameter valid. Parameter NaN tidak dikirim.
    if (adaNilaiValid(suhuC, phValue, salinityPpt)) {
      kirimDataUART();
    } else {
      Serial.println("[WARNING] Semua parameter tidak valid, tidak ada yang dikirim.");
    }

    sampleIndex  = 0;
    sampleFilled = 0;
  }

  esp_task_wdt_reset();   // tanda "loop masih hidup"
  delay(10);
}
