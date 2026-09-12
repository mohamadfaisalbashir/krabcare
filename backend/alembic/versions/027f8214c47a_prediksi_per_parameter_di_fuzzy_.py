"""prediksi per parameter di fuzzy_predictions

Simpan nilai ramalan FTS per parameter (pH, suhu, salinitas), bukan cuma skor
agregat hasil peleburan Mamdani. Halaman detail kolam butuh angka itu untuk
menampilkan tren tiap parameter, jadi disimpan, bukan dihitung ulang.

Presisi disamakan dengan sensor_readings (ph 4,2 / suhu 4,1 / salinitas 5,2).
Nullable, supaya baris prediksi sebelum migrasi ini tetap valid.

Revision ID: 027f8214c47a
Revises: 3de7a89a502f
Create Date: 2026-08-31 10:18:34.816723

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '027f8214c47a'
down_revision: Union[str, None] = '3de7a89a502f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fuzzy_predictions', sa.Column('predicted_ph', sa.Numeric(precision=4, scale=2), nullable=True))
    op.add_column('fuzzy_predictions', sa.Column('predicted_temperature_c', sa.Numeric(precision=4, scale=1), nullable=True))
    op.add_column('fuzzy_predictions', sa.Column('predicted_salinity_ppt', sa.Numeric(precision=5, scale=2), nullable=True))


def downgrade() -> None:
    op.drop_column('fuzzy_predictions', 'predicted_salinity_ppt')
    op.drop_column('fuzzy_predictions', 'predicted_temperature_c')
    op.drop_column('fuzzy_predictions', 'predicted_ph')
