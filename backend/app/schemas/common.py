"""Tipe bersama untuk parameter endpoint."""

import math
from typing import Annotated

from fastapi import Path, Query
from pydantic import BeforeValidator

# Semua id tabel bertipe SERIAL = int4 PostgreSQL (maks 2_147_483_647). Nilai
# di luar rentang ini ditolak Postgres sebagai NumericValueOutOfRange, yang
# tanpa batas ini muncul sebagai HTTP 500. Dibatasi di lapisan validasi supaya
# jadi 422 yang wajar.
INT4_MAX = 2_147_483_647

#: Id sebagai path param (mis. /kolam/{kolam_id}).
IdPath = Annotated[int, Path(ge=1, le=INT4_MAX)]

#: Id sebagai query param wajib (mis. ?device_id=...).
IdQueryReq = Annotated[int, Query(ge=1, le=INT4_MAX)]

#: Id sebagai query param opsional.
IdQuery = Annotated[int | None, Query(ge=1, le=INT4_MAX)]


def _kosong_jadi_none(v):
    """Sensor yang gagal membaca mengirim NaN atau string kosong. Disimpan NULL,
    bukan ditolak: NaN gagal batas ge/le (422) atau malah masuk NUMERIC
    Postgres sebagai NaN. NULL tampil "N/A" dan ditandai "kosong" oleh
    services/sensor_status.py."""
    if isinstance(v, str) and v.strip().lower() in ("", "nan", "null", "none"):
        return None
    if isinstance(v, float) and not math.isfinite(v):
        return None
    return v


#: Angka opsional dari payload ingest: NaN, inf, dan kosong jadi None.
AngkaOpsional = Annotated[float | None, BeforeValidator(_kosong_jadi_none)]
