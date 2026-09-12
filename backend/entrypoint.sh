#!/bin/sh
# Jalankan migrasi Alembic sebelum server naik, supaya skema DB selalu sinkron
# dengan model tiap deploy. Migrasi yang ketinggalan pernah bikin
# /quality/latest 500 di production (fuzzy_predictions.predicted_ph, 4 Sep 2026).
set -e
alembic upgrade head
exec "$@"
