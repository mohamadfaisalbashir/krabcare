"""restart perangkat

Tabel device_restarts (log tiap ESP restart), kolom devices.last_restart_at
untuk status "Restarting" di dashboard, dan nilai 'restart' di CHECK
notifications.source.

Revision ID: b7d3e9f1a2c5
Revises: a8d2f6c1e935
Create Date: 2026-11-18 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b7d3e9f1a2c5'
down_revision: Union[str, None] = 'a8d2f6c1e935'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ganti_check(nilai: str) -> None:
    op.execute("ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_source_check")
    op.execute(
        "ALTER TABLE notifications ADD CONSTRAINT notifications_source_check "
        f"CHECK (source IN ({nilai}))"
    )


def upgrade() -> None:
    op.create_table(
        'device_restarts',
        sa.Column('device_id', sa.Integer(), sa.ForeignKey('devices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('time', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('reset_reason', sa.Text(), nullable=True),
        sa.Column('received_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('device_id', 'time'),
    )
    op.add_column('devices', sa.Column('last_restart_at', sa.TIMESTAMP(timezone=True), nullable=True))
    _ganti_check("'classification', 'prediction', 'parameter', 'sensor', 'restart'")


def downgrade() -> None:
    op.execute("DELETE FROM notifications WHERE source = 'restart'")
    _ganti_check("'classification', 'prediction', 'parameter', 'sensor'")
    op.drop_column('devices', 'last_restart_at')
    op.drop_table('device_restarts')
