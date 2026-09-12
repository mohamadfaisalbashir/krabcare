-- Skema tabel KrabCare
-- Parameter kualitas air yang dipantau: pH, suhu (°C), salinitas (ppt)

-- Kategori hasil klasifikasi & prediksi kualitas air.
CREATE TYPE water_quality_category AS ENUM ('baik', 'sedang', 'buruk');

-- Tabel node/perangkat.
CREATE TABLE IF NOT EXISTS devices (
    id                SERIAL PRIMARY KEY,
    device_code       TEXT NOT NULL UNIQUE,              -- MAC ESP32 tanpa pemisah, mis. "54D660E9BFB4"
    device_type       TEXT NOT NULL DEFAULT 'slave_node'
                          CHECK (device_type IN ('slave_node', 'master_node', 'gateway')),
    level_number      SMALLINT,                          -- tingkat pada rak vertikal (khusus slave_node)
    rack_label        TEXT,                              -- label rak/unit budidaya, mis. "Rak A"
    parent_device_id  INTEGER REFERENCES devices(id) ON DELETE SET NULL,
    location_note     TEXT,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devices_parent ON devices (parent_device_id);

-- Data mentah sensor (hypertable, partisi berdasarkan kolom `time`).
CREATE TABLE IF NOT EXISTS sensor_readings (
    time             TIMESTAMPTZ NOT NULL,
    device_id        INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    ph               NUMERIC(4, 2),
    temperature_c    NUMERIC(4, 1),
    salinity_ppt     NUMERIC(5, 2),
    received_at      TIMESTAMPTZ NOT NULL DEFAULT now(),  -- waktu backend menerima data dari gateway
    PRIMARY KEY (device_id, time)
);

-- Hasil klasifikasi fuzzy logic (dihitung dari sensor_readings terbaru).
CREATE TABLE IF NOT EXISTS fuzzy_classifications (
    time                 TIMESTAMPTZ NOT NULL,           -- waktu klasifikasi dihitung
    device_id            INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    sensor_reading_time  TIMESTAMPTZ,                    -- acuan waktu reading yang diklasifikasikan
    quality_score        NUMERIC(5, 2) NOT NULL,         -- skor hasil defuzzifikasi (mis. 0-100)
    quality_category     water_quality_category NOT NULL,
    membership_degrees   JSONB,                          -- derajat keanggotaan tiap himpunan fuzzy
    model_version        TEXT NOT NULL DEFAULT 'v1',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (device_id, time)
);

-- Hasil prediksi tren kualitas air (WLR).
CREATE TABLE IF NOT EXISTS fuzzy_predictions (
    time                     TIMESTAMPTZ NOT NULL,       -- waktu prediksi dibuat
    device_id                INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    target_time              TIMESTAMPTZ NOT NULL,       -- waktu yang diprediksi
    horizon_minutes          INTEGER NOT NULL,           -- horizon prediksi dalam menit
    predicted_quality_score  NUMERIC(5, 2),
    predicted_category       water_quality_category,
    model_version            TEXT NOT NULL DEFAULT 'v1',
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (device_id, time, horizon_minutes)
);

CREATE INDEX IF NOT EXISTS idx_fuzzy_predictions_device_target
    ON fuzzy_predictions (device_id, target_time DESC);
