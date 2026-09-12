#!/usr/bin/env bash
# Migrasi database untuk produksi
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== 1/3 Backup sebelum migrasi =="
./scripts/backup_db.sh

echo "== 2/3 Revisi saat ini =="
docker compose exec -T backend alembic current

echo "== 3/3 alembic upgrade head =="
docker compose exec -T backend alembic upgrade head

echo "== Revisi setelah migrasi =="
docker compose exec -T backend alembic current
