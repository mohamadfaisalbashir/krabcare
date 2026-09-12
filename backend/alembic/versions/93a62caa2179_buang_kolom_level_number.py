"""buang kolom devices.level_number

Satu kolam = satu rak = satu slave device (kolam_service.claim_device menolak
klaim kedua sejak migrasi b3f1c7a9d204), jadi konsep "tingkat" di dalam satu
rak tidak dipakai lagi di model, schema, maupun UI.

Nilai lama ikut hilang. downgrade() cuma mengembalikan strukturnya sebagai
kolom nullable, tidak datanya.

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
