"""urutan kolam

Posisi kartu kolam di dashboard hasil drag and drop. NULL = belum pernah
diatur user, jadi kolam lama tetap memakai urutan default (kolam master dulu).

Revision ID: f2a9c4e7b1d6
Revises: e7c3b1d5a842
Create Date: 2026-11-11 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f2a9c4e7b1d6'
down_revision: Union[str, None] = 'e7c3b1d5a842'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("kolam", sa.Column("urutan", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("kolam", "urutan")
