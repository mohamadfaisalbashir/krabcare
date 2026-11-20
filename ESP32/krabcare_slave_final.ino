/**
 * Firmware Node Slave (ESP-NOW Sender) - KrabCare
 * ESP32 DevKitC V4
 *
 * Pin:
 *   DS18B20  -> GPIO25 (pull-up 4.7k ke 3V3)
 *   TDS/EC   -> GPIO33 (ADC1)
 *   pH4502C  -> GPIO32 (ADC1)
 *   LCD I2C  -> SDA 21, SCL 22 (VCC 5V)
 *
 * Sample tiap 5 detik, rata-rata dikirim tiap 60 detik via ESP-NOW
 * (tanpa WiFi router / GSM, channel dikunci).
 *
 * Fitur:
 *  1. Deteksi sensor pH dan TDS/EC rusak lewat tegangan (mendekati 0 V atau
 *     saturasi ADC / melebihi batas datasheet board) -> nilai NaN.
 *  2. Parameter NaN tidak dikirim: struct ESP-NOW berukuran tetap, jadi slave
 *     menandai parameter valid lewat bitmask "valid" dan master hanya
 *     meneruskan field yang bit-nya aktif. Paket dikirim selama minimal satu
 *     parameter valid.
 *  3. Task Watchdog 20 detik: jika loop() hang, ESP32 restart otomatis.
 *  4. Penyebab restart (esp_reset_reason) dicetak di Serial dan LCD, dan
 *     dikirim ke master saat boot (paket type BOOT) untuk diteruskan ke Raspi
 *     sebagai event "boot".
 *
 * CATATAN ADC internal ESP32:
 *  - Nonlinear di dekat 0 V dan saturasi mulai sekitar 3.1 V (ADC_11db).
 *  - Batas atas board EC (3.2 V) tidak bisa dibedakan dari saturasi, jadi
 *    batas atas EC dipakai sebagai "saturasi / kemungkinan short".
 *  - Jika ingin deteksi lebih presisi, gunakan ADS1115 seperti master.
 */

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <esp_idf_version.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <math.h>

// ======================== PIN ========================
#define ONE_WIRE_PIN 25
#define TDS_PIN      33
#define PH_PIN       32
#define LCD_SDA      21
#define LCD_SCL      22

// ======================== ESP-NOW ========================
#define ESPNOW_CHANNEL 1   // HARUS sama dengan receiver

// GANTI dengan MAC (STA) ESP receiver, lihat Serial Monitor receiver saat boot
uint8_t receiverMAC[] = {0x20, 0x9B, 0xA9, 0x7D, 0x14, 0xD8};

// Struct HARUS identik dengan receiver (master)
#define PKT_TYPE_DATA  0
#define PKT_TYPE_BOOT  1
#define VALID_SUHU     0x01
#define VALID_PH       0x02
#define VALID_SAL      0x04

typedef struct __attribute__((packed)) {
  uint8_t type;       // PKT_TYPE_DATA atau PKT_TYPE_BOOT
  char    id[13];     // chip ID (12 hex + null)
  uint8_t valid;      // bitmask parameter valid (VALID_*)
  float   suhu;
  float   ph;
  float   salinitas;
  char    reason[12]; // alasan restart (untuk type BOOT)
} SensorPacket;

SensorPacket packet;

// ======================== KALIBRASI ========================
// TODO: ganti dengan hasil kalibrasi slave yang sebenarnya
float PH_SLOPE  = -5.500;   // pH = SLOPE * volt + OFFSET
float PH_OFFSET = 21.789;
const float SALINITY_FACTOR = 1.0f;  // ppt ~= TDS(ppm)/1000 * faktor

// ======================== BATAS DETEKSI SENSOR RUSAK (Volt) ========================
// Nilai awal, HARUS diverifikasi dengan uji probe tercelup vs dicabut
// (lihat Serial: Vph dan Vtds).
// Board pH  : pH4502C, output 0~5 V, tetapi input ke ESP32 dibatasi 0~3.3 V
// Board TDS : output 0~3.2 V (spesifikasi sama dengan master, beda probe saja)
// ADC internal 11 dB jenuh sekitar 3.1~3.3 V.
const float PH_V_MIN  = 0.10f;
const float PH_V_MAX  = 3.10f;
const float TDS_V_MIN = 0.05f;   // sama dengan master (EC_V_MIN)
const float TDS_V_MAX = 3.30f;   // sama dengan master (EC_V_MAX)

// ======================== TIMING ========================
const unsigned long SAMPLE_INTERVAL_MS = 5000UL;
const unsigned long SEND_INTERVAL_MS   = 60000UL;
const int SAMPLES_PER_SEND = SEND_INTERVAL_MS / SAMPLE_INTERVAL_MS;  // 12
const int MIN_VALID_SAMPLES = SAMPLES_PER_SEND / 2;                  // 6 dari 12
const int ADC_SAMPLES = 30;

// Satu siklus ambilSampel() bisa sekitar 3.5 detik, jadi 5 detik terlalu mepet.
#define WDT_TIMEOUT_S 20

unsigned long lastSample = 0, lastSend = 0;

// ======================== OBJEK ========================
OneWire oneWire(ONE_WIRE_PIN);
DallasTemperature ds18b20(&oneWire);
LiquidCrystal_I2C lcd(0x27, 20, 4);

String deviceID;
String resetReasonStr = "";
float bufSuhu[SAMPLES_PER_SEND], bufPH[SAMPLES_PER_SEND], bufSal[SAMPLES_PER_SEND];
int sampleIndex = 0, sampleFilled = 0;

// ======================== UTILITAS ========================
String dapatkanChipID() {
  uint64_t raw = ESP.getEfuseMac();
  char b[13];
  snprintf(b, sizeof(b), "%04X%08X", (uint16_t)(raw >> 32), (uint32_t)raw);
  return String(b);
}

void lcdPrintLine(int row, String text) {
  while (text.length() < 20) text += " ";
  if (text.length() > 20) text = text.substring(0, 20);
  lcd.setCursor(0, row);
  lcd.print(text);
}

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
    .idle_core_mask = 0,
    .trigger_panic  = true
  };
  if (esp_task_wdt_reconfigure(&cfg) == ESP_ERR_INVALID_STATE) {
    esp_task_wdt_init(&cfg);
  }
#else
  esp_task_wdt_init(WDT_TIMEOUT_S, true);
#endif
  esp_task_wdt_add(NULL);
  Serial.printf("[INFO] Watchdog aktif, timeout %d detik.\n", WDT_TIMEOUT_S);
}

// Median ADC (mV) untuk meredam noise
float bacaMilliVoltMedian(uint8_t pin) {
  int v[ADC_SAMPLES];
  for (int i = 0; i < ADC_SAMPLES; i++) {
    v[i] = analogReadMilliVolts(pin);
    delay(5);
  }
  for (int i = 1; i < ADC_SAMPLES; i++) {
    int key = v[i], j = i - 1;
    while (j >= 0 && v[j] > key) { v[j + 1] = v[j]; j--; }
    v[j + 1] = key;
  }
  return (ADC_SAMPLES % 2) ? v[ADC_SAMPLES / 2]
                           : (v[ADC_SAMPLES / 2] + v[ADC_SAMPLES / 2 - 1]) / 2.0f;
}

float bacaSuhu() {
  for (int a = 1; a <= 3; a++) {
    ds18b20.requestTemperatures();
    float t = ds18b20.getTempCByIndex(0);
    // 85 °C = nilai awal DS18B20 sebelum konversi selesai (bukan suhu air sebenarnya)
    if (t != DEVICE_DISCONNECTED_C && !isnan(t) && fabsf(t - 85.0f) > 0.01f) return t;
    delay(200);
  }
  return NAN;
}

// NaN jika tegangan di luar rentang wajar atau hasil pH di luar 0..14
float bacaPH(float &volt) {
  volt = bacaMilliVoltMedian(PH_PIN) / 1000.0f;
  if (volt < PH_V_MIN || volt > PH_V_MAX) return NAN;
  float ph = PH_SLOPE * volt + PH_OFFSET;
  if (ph < 0.0f || ph > 14.0f) return NAN;
  return ph;
}

// Rumus DFRobot Gravity TDS + kompensasi suhu
// NaN jika tegangan di luar rentang wajar
float bacaSalinitas(float suhu, float &volt) {
  volt = bacaMilliVoltMedian(TDS_PIN) / 1000.0f;
  if (volt < TDS_V_MIN || volt > TDS_V_MAX) return NAN;
  float koef = 1.0f + 0.02f * (suhu - 25.0f);
  float vc = volt / koef;
  float tds = (133.42f * vc * vc * vc - 255.86f * vc * vc + 857.39f * vc) * 0.5f;
  if (tds < 0) tds = 0;
  return (tds / 1000.0f) * SALINITY_FACTOR;  // ppt
}

// Rata-rata hanya dari nilai valid; NaN jika sampel valid < minValid
float rataRataBuffer(float *arr, int len, int minValid) {
  float sum = 0; int c = 0;
  for (int i = 0; i < len; i++) if (isfinite(arr[i])) { sum += arr[i]; c++; }
  return (c >= minValid && c > 0) ? sum / c : NAN;
}

bool adaNilaiValid(float s, float ph, float sal) {
  return isfinite(s) || isfinite(ph) || isfinite(sal);
}

// ======================== ESP-NOW ========================
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
void onSent(const esp_now_send_info_t *info, esp_now_send_status_t status) {
#else
void onSent(const uint8_t *mac, esp_now_send_status_t status) {
#endif
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "[ESP-NOW] Terkirim" : "[ESP-NOW] GAGAL");
}

bool initEspNow() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  esp_wifi_set_promiscuous(true);
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);

  if (esp_now_init() != ESP_OK) {
    Serial.println("[ERROR] esp_now_init gagal");
    return false;
  }
  esp_now_register_send_cb(onSent);

  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, receiverMAC, 6);
  peer.channel = ESPNOW_CHANNEL;
  peer.encrypt = false;
  if (esp_now_add_peer(&peer) != ESP_OK) {
    Serial.println("[ERROR] add peer gagal");
    return false;
  }
  return true;
}

// Hanya parameter valid yang ditandai di bitmask; field NaN tidak dipakai
// (nilainya 0 dan bit-nya tidak aktif), jadi master tidak akan meneruskannya.
void kirimESPNow(float suhu, float ph, float sal) {
  memset(&packet, 0, sizeof(packet));
  packet.type = PKT_TYPE_DATA;
  deviceID.toCharArray(packet.id, sizeof(packet.id));
  if (isfinite(suhu)) { packet.suhu      = suhu; packet.valid |= VALID_SUHU; }
  if (isfinite(ph))   { packet.ph        = ph;   packet.valid |= VALID_PH;   }
  if (isfinite(sal))  { packet.salinitas = sal;  packet.valid |= VALID_SAL;  }
  esp_err_t r = esp_now_send(receiverMAC, (uint8_t *)&packet, sizeof(packet));
  if (r != ESP_OK) Serial.printf("[ERROR] esp_now_send: %d\n", r);
}

// Kirim event boot berisi alasan restart ke master (diteruskan ke Raspi)
void kirimBootESPNow() {
  memset(&packet, 0, sizeof(packet));
  packet.type = PKT_TYPE_BOOT;
  deviceID.toCharArray(packet.id, sizeof(packet.id));
  resetReasonStr.toCharArray(packet.reason, sizeof(packet.reason));
  esp_err_t r = esp_now_send(receiverMAC, (uint8_t *)&packet, sizeof(packet));
  if (r != ESP_OK) Serial.printf("[ERROR] esp_now_send boot: %d\n", r);
}

// ======================== SAMPLING ========================
void ambilSampel() {
  float s = bacaSuhu();
  bool suhuOk = isfinite(s);
  float vPH = 0, vTDS = 0;
  float ph  = bacaPH(vPH);
  float sal = bacaSalinitas(suhuOk ? s : 25.0f, vTDS);

  bufSuhu[sampleIndex] = s;
  bufPH[sampleIndex]   = ph;
  bufSal[sampleIndex]  = sal;
  sampleIndex = (sampleIndex + 1) % SAMPLES_PER_SEND;
  if (sampleFilled < SAMPLES_PER_SEND) sampleFilled++;

  Serial.printf("[SAMPLE] Suhu=%.2f pH=%.2f (Vph=%.3f) Sal=%.3f (Vtds=%.3f)\n",
                s, ph, vPH, sal, vTDS);

  lcdPrintLine(0, "ID : " + deviceID);
  lcdPrintLine(1, suhuOk        ? "Suhu : " + String(s, 1) + " C"      : "Suhu : ERROR");
  lcdPrintLine(2, isfinite(ph)  ? "pH   : " + String(ph, 2)            : "pH   : ERROR");
  lcdPrintLine(3, isfinite(sal) ? "Sal  : " + String(sal, 2) + " ppt"  : "Sal  : ERROR");
}

// ======================== SETUP / LOOP ========================
void setup() {
  Serial.begin(115200);
  delay(500);

  resetReasonStr = resetReasonToString(esp_reset_reason());

  analogReadResolution(12);
  analogSetPinAttenuation(TDS_PIN, ADC_11db);
  analogSetPinAttenuation(PH_PIN, ADC_11db);

  deviceID = dapatkanChipID();
  Serial.println("=== KrabCare Slave (Sender) ===");
  Serial.println("Device ID    : " + deviceID);
  Serial.println("Reset reason : " + resetReasonStr);

  ds18b20.begin();
  Wire.begin(LCD_SDA, LCD_SCL);
  lcd.init();
  lcd.backlight();
  lcdPrintLine(0, "KrabCare Slave");
  lcdPrintLine(1, "ID : " + deviceID);

  bool nowOk = initEspNow();
  Serial.println("MAC (STA) : " + WiFi.macAddress());
  lcdPrintLine(2, nowOk ? "ESP-NOW OK" : "ESP-NOW ERROR");
  lcdPrintLine(3, "R: " + resetReasonStr);
  if (nowOk) kirimBootESPNow();
  delay(1500);

  lastSample = lastSend = millis();
  initWatchdog();   // paling akhir agar proses setup tidak memicu watchdog
}

void loop() {
  unsigned long now = millis();

  if (now - lastSample >= SAMPLE_INTERVAL_MS) {
    lastSample = now;
    ambilSampel();
  }

  if (now - lastSend >= SEND_INTERVAL_MS) {
    lastSend = now;
    float s   = rataRataBuffer(bufSuhu, sampleFilled, MIN_VALID_SAMPLES);
    float ph  = rataRataBuffer(bufPH,   sampleFilled, MIN_VALID_SAMPLES);
    float sal = rataRataBuffer(bufSal,  sampleFilled, MIN_VALID_SAMPLES);

    if (adaNilaiValid(s, ph, sal)) {
      Serial.printf("[KIRIM] Suhu=%s pH=%s Sal=%s\n",
                    isfinite(s)   ? String(s, 2).c_str()   : "NaN",
                    isfinite(ph)  ? String(ph, 2).c_str()  : "NaN",
                    isfinite(sal) ? String(sal, 3).c_str() : "NaN");
      kirimESPNow(s, ph, sal);
    } else {
      Serial.println("[WARNING] Semua parameter tidak valid, kirim dilewati");
    }
    sampleIndex = 0;
    sampleFilled = 0;
  }

  esp_task_wdt_reset();   // tanda "loop masih hidup"
  delay(10);
}
