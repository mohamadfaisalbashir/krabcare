"""baseline skema init 01-08

Revisi NO-OP dengan sengaja. Skema sampai titik ini (tabel, hypertable, index,
seed device) dibuat oleh database/init/01_*.sql s.d. 08_*.sql saat volume pgdata
pertama kali dibuat — BUKAN oleh Alembic. Revisi ini hanya menjadi titik nol
riwayat migrasi.

Untuk database yang SUDAH ada (dev maupun VPS), tandai tanpa menjalankan apa pun:
    docker compose exec backend alembic stamp head

Mulai revisi berikutnya, SEMUA perubahan skema lewat Alembic.
database/init/01-08 beku — jangan pernah menambah file 09 ke folder itu.

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
