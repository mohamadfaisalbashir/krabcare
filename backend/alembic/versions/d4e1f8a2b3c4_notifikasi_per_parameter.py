"""notifikasi per parameter

Menambahkan kolom `parameter` pada tabel `notifications` dan memperluas
`source` agar mencakup notifikasi individual parameter ('ph', 'temperature_c',
'salinity_ppt', 'ammonia').

Revision ID: d4e1f8a2b3c4
Revises: 93a62caa2179
Create Date: 2026-09-05 14:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e1f8a2b3c4'
down_revision: Union[str, None] = '93a62caa2179'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tambah kolom parameter
    op.add_column('notifications', sa.Column('parameter', sa.Text(), nullable=True))

    # 2. Update CHECK constraint source
    op.execute(
        "ALTER TABLE notifications "
        "DROP CONSTRAINT IF EXISTS notifications_source_check"
    )
    op.execute(
        "ALTER TABLE notifications "
        "ADD CONSTRAINT notifications_source_check "
        "CHECK (source IN ('classification', 'prediction', 'parameter'))"
    )

    # 3. Update UNIQUE constraint untuk menyertakan parameter (NULLS NOT DISTINCT)
    op.execute(
        "ALTER TABLE notifications "
        "DROP CONSTRAINT IF EXISTS notifications_device_id_source_event_time_key"
    )
    op.execute(
        "ALTER TABLE notifications "
        "ADD CONSTRAINT notifications_device_id_source_event_time_parameter_key "
        "UNIQUE NULLS NOT DISTINCT (device_id, source, event_time, parameter)"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE notifications "
        "DROP CONSTRAINT IF EXISTS notifications_device_id_source_event_time_parameter_key"
    )
    op.execute(
        "ALTER TABLE notifications "
        "ADD CONSTRAINT notifications_device_id_source_event_time_key "
        "UNIQUE (device_id, source, event_time)"
    )
    op.execute(
        "ALTER TABLE notifications "
        "DROP CONSTRAINT IF EXISTS notifications_source_check"
    )
    op.execute(
        "ALTER TABLE notifications "
        "ADD CONSTRAINT notifications_source_check "
        "CHECK (source IN ('classification', 'prediction'))"
    )
    op.drop_column('notifications', 'parameter')
