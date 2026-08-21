-- Konversi tabel time-series menjadi hypertable TimescaleDB.
-- chunk_time_interval default 7 hari, cukup untuk skala data 1 supermarket/beberapa rak.

SELECT create_hypertable(
    'sensor_readings', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

SELECT create_hypertable(
    'fuzzy_classifications', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

SELECT create_hypertable(
    'fuzzy_predictions', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- Catatan produksi (opsional, belum diaktifkan):
-- Retention policy otomatis, mis. buang data mentah > 1 tahun:
--   SELECT add_retention_policy('sensor_readings', INTERVAL '365 days');
-- Compression untuk chunk lama agar hemat storage:
--   ALTER TABLE sensor_readings SET (timescaledb.compress, timescaledb.compress_segmentby = 'device_id');
--   SELECT add_compression_policy('sensor_readings', INTERVAL '30 days');
