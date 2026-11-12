"""notifikasi sensor error

Memperluas CHECK `source` di tabel `notifications` dengan nilai 'sensor',
dipakai notifikasi sensor error (services/sensor_status.py).

Revision ID: a8d2f6c1e935
Revises: f2a9c4e7b1d6
Create Date: 2026-11-12 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a8d2f6c1e935'
down_revision: Union[str, None] = 'f2a9c4e7b1d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ganti_check(nilai: str) -> None:
    op.execute("ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_source_check")
    op.execute(
        "ALTER TABLE notifications ADD CONSTRAINT notifications_source_check "
        f"CHECK (source IN ({nilai}))"
    )


def upgrade() -> None:
    _ganti_check("'classification', 'prediction', 'parameter', 'sensor'")


def downgrade() -> None:
    # Baris 'sensor' harus dibuang dulu, kalau tidak CHECK lama gagal dipasang.
    op.execute("DELETE FROM notifications WHERE source = 'sensor'")
    _ganti_check("'classification', 'prediction', 'parameter'")
