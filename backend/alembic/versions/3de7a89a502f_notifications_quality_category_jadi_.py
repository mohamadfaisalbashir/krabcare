"""notifications.quality_category jadi enum native

Selaraskan tipe kolom `notifications.quality_category` dengan
database/init/08_notifications.sql, yaitu enum native `water_quality_category`.
Di DB dev kolom itu bertipe TEXT + CHECK karena tabelnya dibuat dari versi lama
file SQL dan `CREATE TABLE IF NOT EXISTS` melewatkan perbaikannya.

CHECK `notifications_quality_category_check` ikut dibuang: isinya membandingkan
kolom dengan literal text, jadi setelah kolomnya jadi enum, ALTER-nya gagal
(operator `water_quality_category = text` tidak ada). Tipe enum sendiri sudah
membatasi nilainya.

Kondisional: di server yang kolomnya sudah enum, upgrade() langsung keluar.
Karena itu downgrade() selalu menghasilkan TEXT + CHECK, termasuk di server yang
aslinya enum; kondisi awal per-server tidak dicatat di mana pun.

Revision ID: 3de7a89a502f
Revises: 445f8540edcb
Create Date: 2026-08-28 13:10:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '3de7a89a502f'
down_revision: Union[str, None] = '445f8540edcb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CEK_TIPE = sa.text(
    "SELECT udt_name FROM information_schema.columns "
    "WHERE table_name = 'notifications' AND column_name = 'quality_category'"
)


def _tipe_sekarang() -> str | None:
    return op.get_bind().execute(_CEK_TIPE).scalar()


def upgrade() -> None:
    if _tipe_sekarang() == "water_quality_category":
        return  # sudah sesuai (mis. VPS hasil boot pertama), tidak ada yang perlu diubah

    # Harus dibuang dulu: CHECK ini membandingkan kolom dengan literal text,
    # jadi menghalangi konversi ke enum.
    op.execute(
        "ALTER TABLE notifications "
        "DROP CONSTRAINT IF EXISTS notifications_quality_category_check"
    )
    # USING wajib: tanpa itu Postgres menolak konversi text ke enum.
    op.execute(
        "ALTER TABLE notifications "
        "ALTER COLUMN quality_category TYPE water_quality_category "
        "USING quality_category::water_quality_category"
    )


def downgrade() -> None:
    if _tipe_sekarang() == "text":
        return

    op.execute(
        "ALTER TABLE notifications "
        "ALTER COLUMN quality_category TYPE TEXT "
        "USING quality_category::text"
    )
    op.execute(
        "ALTER TABLE notifications ADD CONSTRAINT notifications_quality_category_check "
        "CHECK (quality_category = ANY (ARRAY['baik'::text, 'sedang'::text, 'buruk'::text]))"
    )
