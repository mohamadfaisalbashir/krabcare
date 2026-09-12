"""verifikasi email saat daftar

Tambah kolom verifikasi email pada `users`:
  - verify_token_hash / verify_token_expires_at : token aktivasi, polanya sama
    dengan reset_token_* (yang disimpan cuma sha256-nya, sekali pakai)
  - email_verified_at                           : NULL = belum terverifikasi

Kolom sendiri, tidak menumpang `is_active` yang artinya "dinonaktifkan admin".
Kalau digabung, pesan galat login pasti salah untuk salah satu keadaan.

Revision ID: e7c3b1d5a842
Revises: d4e1f8a2b3c4
Create Date: 2026-09-09 15:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7c3b1d5a842'
down_revision: Union[str, None] = 'd4e1f8a2b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Semua nullable=True: tabel users sudah berisi data, dan kolom NOT NULL
    # tanpa default akan menggagalkan migrasi (lihat README).
    op.add_column('users', sa.Column('verify_token_hash', sa.Text(), nullable=True))
    op.add_column(
        'users',
        sa.Column('verify_token_expires_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('email_verified_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )

    # Wajib. Login menolak email_verified_at yang NULL, jadi tanpa backfill ini
    # semua akun lama (termasuk admin hasil seed) terkunci di luar. Akun lama
    # dianggap terverifikasi karena mendaftar sebelum aturan ini ada.
    op.execute("UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL")


def downgrade() -> None:
    op.drop_column('users', 'email_verified_at')
    op.drop_column('users', 'verify_token_expires_at')
    op.drop_column('users', 'verify_token_hash')
