-- Notifikasi in-app (dari hook anomali ml_pipeline_service) + token push (FCM).

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    kolam_id INTEGER NOT NULL REFERENCES kolam(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('classification', 'prediction')),
    quality_category TEXT NOT NULL CHECK (quality_category IN ('baik', 'sedang', 'buruk')),
    event_time TIMESTAMPTZ NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    is_pushed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (device_id, source, event_time)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS push_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens (user_id);
