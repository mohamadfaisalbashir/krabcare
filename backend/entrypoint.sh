#!/bin/sh
# Jalanin migrasi Alembic dulu sebelum server naik, biar skema DB selalu
# sinkron sama model tiap deploy, gak perlu diinget manual (lihat insiden
# fuzzy_predictions.predicted_ph 04 Sep 2026: migrasi ketinggalan, /quality/latest
# 500 di production).
set -e
alembic upgrade head
exec "$@"
