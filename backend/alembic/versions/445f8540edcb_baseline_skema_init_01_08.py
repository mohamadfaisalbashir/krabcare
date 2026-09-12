"""baseline skema init 01-08

Revisi no-op. Skema sampai titik ini (tabel, hypertable, index, seed device)
dibuat database/init/01_*.sql sampai 08_*.sql saat volume pgdata pertama kali
dibuat, bukan oleh Alembic. Revisi ini cuma titik nol riwayat migrasi.

Untuk database yang sudah ada, tandai tanpa menjalankan apa pun:
    docker compose exec backend alembic stamp head

Mulai revisi berikutnya, semua perubahan skema lewat Alembic.
database/init/01-08 beku, jangan menambah file 09 ke folder itu.

Revision ID: 445f8540edcb
Revises: 
Create Date: 2026-08-28 12:55:21.100847

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '445f8540edcb'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No-op: skema dibuat oleh database/init/*.sql, lihat docstring di atas.
    pass


def downgrade() -> None:
    # No-op: tidak ada yang perlu dibatalkan dari baseline.
    pass
