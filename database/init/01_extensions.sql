-- Ekstensi TimescaleDB untuk hypertable time-series.
-- Dijalankan otomatis oleh image Docker timescale/timescaledb saat first-boot
-- (file di /docker-entrypoint-initdb.d/ dieksekusi berurutan sesuai nama file).

CREATE EXTENSION IF NOT EXISTS timescaledb;
