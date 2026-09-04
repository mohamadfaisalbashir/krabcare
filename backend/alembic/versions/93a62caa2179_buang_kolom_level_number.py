"""buang kolom devices.level_number

Produk disederhanakan: satu kolam = satu rak = TEPAT SATU slave device (lihat
kolam_service.claim_device — klaim device kedua ke kolam yang sama sudah
ditolak sejak migrasi b3f1c7a9d204). Konsep "tingkat" di dalam satu rak tidak
lagi dipakai di mana pun pada kode aplikasi (model/schema/UI) — kolom ini
sisa desain lama yang membayangkan banyak slave per level dalam satu rak.

Nilai kolom ini untuk baris yang sudah ada (kalau ada) IKUT HILANG saat
downgrade dijalankan mundur lagi — cuma strukturnya yang bisa dikembalikan,
bukan datanya (nullable, jadi downgrade menaruhnya kembali sebagai NULL).

Revision ID: 93a62caa2179
Revises: c5e2a94f18b7
Create Date: 2026-09-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '93a62caa2179'
down_revision: Union[str, None] = 'c5e2a94f18b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('devices', 'level_number')


def downgrade() -> None:
    op.add_column('devices', sa.Column('level_number', sa.SmallInteger(), nullable=True))
