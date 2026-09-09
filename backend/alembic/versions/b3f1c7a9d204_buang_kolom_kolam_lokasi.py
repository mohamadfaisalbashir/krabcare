"""buang kolom kolam.lokasi

Field lokasi sudah dihapus dari form tambah/ubah rak di web dan tidak dipakai
di mana pun (mobile tidak pernah mengirimnya), jadi kolomnya ikut dibuang.
Nilai lama ikut hilang, memang tidak ada yang membacanya.

Revision ID: b3f1c7a9d204
Revises: 027f8214c47a
Create Date: 2026-09-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b3f1c7a9d204'
down_revision: Union[str, None] = '027f8214c47a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE kolam DROP COLUMN IF EXISTS lokasi")


def downgrade() -> None:
    op.add_column("kolam", sa.Column("lokasi", sa.Text(), nullable=True))
