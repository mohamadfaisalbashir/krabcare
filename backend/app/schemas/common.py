"""Tipe bersama untuk parameter endpoint."""

from typing import Annotated

from fastapi import Path, Query

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
