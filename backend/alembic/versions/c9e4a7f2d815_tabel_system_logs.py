"""tabel system_logs

Log permanen sensor error/pulih dan restart perangkat untuk tab "Sistem
error" di Log Historis. Restart yang sudah tercatat di device_restarts ikut
disalin supaya riwayatnya tidak mulai dari nol.

Revision ID: c9e4a7f2d815
Revises: b7d3e9f1a2c5
Create Date: 2026-11-20 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c9e4a7f2d815'
down_revision: Union[str, None] = 'b7d3e9f1a2c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'system_logs',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('device_id', sa.Integer(), sa.ForeignKey('devices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('time', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('kind', sa.Text(), nullable=False),
        sa.Column('parameter', sa.Text(), nullable=True),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('sensor_error', 'sensor_pulih', 'restart')", name='system_logs_kind_check'
        ),
    )
    # NULLS NOT DISTINCT: restart tidak punya parameter, dan tanpa ini dua
    # restart di waktu yang sama (laporan dikirim ulang) tidak dianggap duplikat.
    op.execute(
        "ALTER TABLE system_logs ADD CONSTRAINT system_logs_unik "
        "UNIQUE NULLS NOT DISTINCT (device_id, kind, time, parameter)"
    )
    op.create_index('system_logs_device_time_idx', 'system_logs', ['device_id', sa.text('time DESC')])
    op.execute(
        "INSERT INTO system_logs (device_id, time, kind, detail) "
        "SELECT device_id, time, 'restart', reset_reason FROM device_restarts "
        "ON CONFLICT DO NOTHING"
    )


def downgrade() -> None:
    op.drop_table('system_logs')
