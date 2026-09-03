"""tabel ammonia_risks + backfill dari sensor_readings

LATAR:
Sensor amonia (MQ-137) dibuang dari hardware, jadi TAN tidak pernah terukur dan
sistem ini TIDAK BOLEH mengeluarkan angka "amonia = X mg/L". Yang bisa dihitung
adalah FRAKSI amonia total yang berbentuk NH3 toksik pada pH/suhu/salinitas
tertentu — persamaan kesetimbangan Bower & Bidwell (1978) / Spotte & Adams
(1983), lihat app/services/ammonia_speciation.py.

Perhitungannya deterministik dan bisa diulang kapan saja, jadi secara teori
tabel ini tidak wajib ada. Ia tetap dibuat karena yang diminta adalah LOG
HISTORIS: parameter mentah datang dari hardware, angka risikonya dari software,
dan keduanya harus bisa ditelusuri berpasangan di kemudian hari — termasuk baris
ramalan, yang tidak punya reading padanannya sama sekali.

Satu tabel, tiga peran, dibedakan `horizon_minutes`:
  0   = kondisi TERUKUR, satu baris per sensor_readings (ditulis saat ingest)
  >0  = RAMALAN FTS, satu baris per horizon (ditulis saat siklus scheduler)

Hypertable dikonversi SEKARANG selagi tabel masih kosong; mengonversi tabel yang
sudah berisi data jauh lebih repot.

Backfill memanggil assess_ammonia_risk() lewat Python, BUKAN menyalin rumusnya
ke SQL — dua salinan rumus kesetimbangan adalah dua sumber kebenaran yang pasti
lepas sinkron. Reading yang salah satu sensornya NULL dilewati, tidak diisi
nilai default palsu.

Revision ID: c5e2a94f18b7
Revises: b3f1c7a9d204
Create Date: 2026-09-03 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c5e2a94f18b7'
down_revision: Union[str, None] = 'b3f1c7a9d204'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ponytail: backfill dibaca sekaligus lalu ditulis per 5000 baris. Cukup untuk
# skala repo ini (beberapa rak x reading tiap 1-15 menit); kalau tabel reading
# kelak berjuta baris, ganti SELECT-nya jadi server-side cursor per device.
UKURAN_BATCH = 5000


def upgrade() -> None:
    op.create_table(
        "ammonia_risks",
        sa.Column("time", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("horizon_minutes", sa.Integer(), nullable=False),
        sa.Column("target_time", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("input_ph", sa.Numeric(precision=4, scale=2), nullable=True),
        sa.Column("input_temperature_c", sa.Numeric(precision=4, scale=1), nullable=True),
        sa.Column("input_salinity_ppt", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("fraction_nh3_pct", sa.Numeric(precision=6, scale=3), nullable=True),
        sa.Column("pka", sa.Numeric(precision=6, scale=4), nullable=True),
        sa.Column("risk_level", sa.Text(), nullable=True),
        sa.Column("in_valid_range", sa.Boolean(), nullable=False),
        sa.Column(
            "model_version",
            sa.Text(),
            server_default="speciation-bb78",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("time", "device_id", "horizon_minutes"),
    )

    op.execute(
        "SELECT create_hypertable('ammonia_risks', 'time', "
        "chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE)"
    )

    op.create_index(
        "idx_ammonia_risks_device_target",
        "ammonia_risks",
        ["device_id", sa.text("target_time DESC")],
    )

    _backfill_dari_readings()


def _backfill_dari_readings() -> None:
    """Isi baris horizon 0 dari seluruh sensor_readings yang parameternya lengkap.

    Tanpa ini log historis amonia lahir kosong sampai reading berikutnya masuk,
    padahal datanya sudah ada sejak lama di sensor_readings.
    """
    # Import di dalam fungsi: env.py sudah menaruh package `app` di path, tapi
    # menaruhnya di atas berkas membuat migrasi ini gagal di-load kalau modul
    # servicenya suatu saat dipindah — dan migrasi lama harus tetap bisa jalan.
    from app.services.ammonia_speciation import MODEL_VERSION, assess_ammonia_risk

    bind = op.get_bind()
    baris = bind.execute(
        sa.text(
            "SELECT time, device_id, ph, temperature_c, salinity_ppt "
            "FROM sensor_readings "
            "WHERE ph IS NOT NULL AND temperature_c IS NOT NULL "
            "AND salinity_ppt IS NOT NULL "
            "ORDER BY time"
        )
    ).fetchall()

    if not baris:
        return

    sisip = sa.text(
        "INSERT INTO ammonia_risks (time, device_id, horizon_minutes, target_time, "
        "input_ph, input_temperature_c, input_salinity_ppt, fraction_nh3_pct, pka, "
        "risk_level, in_valid_range, model_version) "
        "VALUES (:time, :device_id, 0, :time, :input_ph, :input_temperature_c, "
        ":input_salinity_ppt, :fraction_nh3_pct, :pka, :risk_level, "
        ":in_valid_range, :model_version) "
        "ON CONFLICT DO NOTHING"
    )

    batch: list[dict] = []
    for waktu, device_id, ph, suhu, salinitas in baris:
        hasil = assess_ammonia_risk(
            ph=float(ph), temperature_c=float(suhu), salinity_ppt=float(salinitas)
        )
        batch.append(
            {
                "time": waktu,
                "device_id": device_id,
                "input_ph": hasil.input_ph,
                "input_temperature_c": hasil.input_temperature_c,
                "input_salinity_ppt": hasil.input_salinity_ppt,
                "fraction_nh3_pct": round(hasil.fraction_nh3_pct, 3),
                "pka": round(hasil.pka, 4),
                "risk_level": hasil.risk_level.value,
                "in_valid_range": hasil.in_valid_range,
                "model_version": MODEL_VERSION,
            }
        )
        if len(batch) >= UKURAN_BATCH:
            bind.execute(sisip, batch)
            batch = []

    if batch:
        bind.execute(sisip, batch)


def downgrade() -> None:
    # Aman dibuang: seluruh isinya turunan deterministik dari sensor_readings
    # (baris terukur) dan fuzzy_predictions (baris ramalan) — bisa dihitung ulang.
    op.drop_index("idx_ammonia_risks_device_target", table_name="ammonia_risks")
    op.drop_table("ammonia_risks")
