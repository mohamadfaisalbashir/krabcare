-- ============================================================
-- Tabel kolam — unit budidaya (satu rak vertikal = satu master node + slave
-- node di bawahnya), dimiliki satu user. Dipakai untuk isolasi kepemilikan data
-- (satu user cuma boleh lihat data device dari kolam miliknya sendiri).
-- ============================================================

CREATE TABLE IF NOT EXISTS kolam (
    id              SERIAL PRIMARY KEY,
    owner_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nama            TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kolam_owner ON kolam (owner_user_id);

-- Device yang sudah ada sebelum migrasi ini otomatis "belum diklaim" (kolam_id
-- NULL) — memang perilaku yang diharapkan, harus diklaim manual lewat
-- POST /kolam/{id}/devices/{device_code}.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS kolam_id INTEGER REFERENCES kolam(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_devices_kolam ON devices (kolam_id);
