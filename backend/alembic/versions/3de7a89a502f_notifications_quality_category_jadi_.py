"""notifications.quality_category jadi enum native

Menyelaraskan tipe kolom `notifications.quality_category` dengan yang ditulis
database/init/08_notifications.sql, yaitu enum native `water_quality_category`.

LATAR: DB dev ternyata punya kolom ini bertipe TEXT + CHECK, padahal file SQL-nya
menulis enum tanpa CHECK. Dibuktikan dengan mem-boot database throwaway dari
database/init/ — hasil fresh-nya enum, dan satu-satunya CHECK di tabel itu adalah
`notifications_source_check`. Jadi tabel notifications di DB dev dibuat dari versi
lama file itu, lalu `CREATE TABLE IF NOT EXISTS` diam-diam melewatkan perbaikannya.
Model SQLAlchemy sudah benar (native enum, create_type=False) — DB dev yang menyusul.

CHECK `notifications_quality_category_check` ikut dibuang: isinya membandingkan
kolom dengan literal text, jadi setelah kolomnya jadi enum Postgres tidak bisa lagi
memvalidasinya (operator `water_quality_category = text` tidak ada) dan ALTER-nya
gagal. Lagipula CHECK itu jadi mubazir — tipe enum sendiri yang membatasi nilainya.

KONDISIONAL, dan itu disengaja: di VPS yang boot pertama kali kolom ini SUDAH
enum, dan migrasi ini ikut jalan di sana juga. Kalau tipenya sudah benar, upgrade()
langsung keluar tanpa melakukan apa pun.

CATATAN downgrade(): downgrade selalu menghasilkan TEXT + CHECK, termasuk pada
database yang aslinya sudah enum (mis. VPS). Ini konsekuensi sadar dari migrasi
kondisional — kondisi awal per-server tidak dicatat di mana pun — bukan kelalaian.
CHECK-nya sengaja dikembalikan supaya kolom TEXT tidak berakhir tanpa pembatas
nilai sama sekali.

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
        return  # sudah sesuai (mis. VPS hasil boot pertama) — tidak ada yang perlu diubah

    # Harus dibuang DULU: CHECK ini membandingkan kolom dengan literal text,
    # sehingga menghalangi konversi ke enum.
    op.execute(
        "ALTER TABLE notifications "
        "DROP CONSTRAINT IF EXISTS notifications_quality_category_check"
    )
    # USING wajib: tanpa itu Postgres menolak konversi text -> enum.
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
