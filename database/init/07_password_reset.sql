-- Kolom reset password: token disimpan dalam bentuk hash (bukan token mentah),
-- kedaluwarsa & sekali pakai (lihat auth_service.request_password_reset/reset_password).

ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;
