-- Device khusus benchmark dataset riil NOAA NERRS SWMP (stasiun gndblwq, Grand Bay
-- NERR, Bangs Lake, Mississippi). SENGAJA TERPISAH dari device produksi mitra
-- (master/SLV*) supaya data riset tidak mencemari data Supermarket Kepiting Surabaya.
--
-- Diisi oleh ml/scripts/import_nerr_dataset.py, bukan oleh gateway.
-- device_type 'slave_node' dipakai karena payload-nya per-titik-ukur, sama seperti
-- slave node. kolam_id sengaja NULL (bukan milik user mana pun — ingest lewat
-- X-API-Key gateway memang tidak dibatasi kepemilikan kolam).
--
-- CATATAN: file di database/init/ CUMA auto-jalan saat volume pgdata masih kosong.
-- Kalau DB sudah pernah dibuat, apply manual:
--   docker compose exec -T db psql -U sismon_kepiting -d sismon_kepiting_db \
--     < database/init/09_seed_nerr_device.sql

INSERT INTO devices (device_code, device_type, rack_label, location_note)
VALUES
    ('NERR-GNDBL', 'slave_node', 'NERR',
     'Dataset NOAA NERRS SWMP gndblwq (Grand Bay, MS) musim hangat — sumber FLRG & holdout RMSE'),
    ('NERR-GNDBL-COLD', 'slave_node', 'NERR',
     'Dataset NERR gndblwq musim dingin (Nov-Apr) — data uji jalur out-of-range fuzzifikasi')
ON CONFLICT (device_code) DO NOTHING;
