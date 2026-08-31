#!/usr/bin/env bash
# Backup database ke backups/. Data sensor dari Raspberry Pi tidak bisa diulang
# kalau hilang, jadi ini bukan opsional.
#
# Pasang ke cron harian di VPS (jam 2 pagi):
#   crontab -e
#   0 2 * * * cd /path/ke/crab && ./scripts/backup_db.sh >> backups/backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."

# Baca .env kalau ada, kalau tidak pakai default yang sama dengan docker-compose.
[ -f .env ] && set -a && . ./.env && set +a
DB_USER="${POSTGRES_USER:-sismon_kepiting}"
DB_NAME="${POSTGRES_DB:-sismon_kepiting_db}"

mkdir -p backups
OUT="backups/${DB_NAME}_$(date +%Y%m%d_%H%M%S).sql.gz"

docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$OUT"

# pg_dump yang gagal di tengah pipe tetap menghasilkan file .gz (kecil) — cek isinya.
if [ ! -s "$OUT" ] || [ "$(stat -c %s "$OUT")" -lt 1024 ]; then
    echo "GAGAL: $OUT kosong/terlalu kecil, backup tidak valid." >&2
    rm -f "$OUT"
    exit 1
fi

echo "Backup OK: $OUT ($(du -h "$OUT" | cut -f1))"

# Simpan 14 hari terakhir saja.
find backups -name '*.sql.gz' -mtime +14 -delete
