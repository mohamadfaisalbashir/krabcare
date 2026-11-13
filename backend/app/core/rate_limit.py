"""Pembatas laju untuk endpoint auth: menahan tebak-sandi dan banjir email.

ponytail: catatan percobaan disimpan di memori proses, jadi hanya benar selama
backend jalan satu worker (docker-compose.prod.yml) dan hilang saat restart.
Pindah ke Redis kalau uvicorn dijalankan multi-worker atau lebih dari satu
container.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

_riwayat: dict[tuple[str, str], deque[float]] = defaultdict(deque)

# Kunci tidak pernah dihapus satu per satu. Kalau jumlah IP unik membengkak
# (mis. diserang dari banyak alamat), seluruh catatan dibuang supaya memori
# tidak tumbuh tanpa batas.
_MAKS_KUNCI = 10_000


def izinkan(kunci: tuple[str, str], maks: int, jendela_detik: float, sekarang: float | None = None) -> bool:
    """True kalau `kunci` masih di bawah `maks` percobaan dalam `jendela_detik` terakhir."""
    now = time.monotonic() if sekarang is None else sekarang
    if len(_riwayat) > _MAKS_KUNCI:
        _riwayat.clear()
    antrean = _riwayat[kunci]
    while antrean and now - antrean[0] >= jendela_detik:
        antrean.popleft()
    if len(antrean) >= maks:
        return False
    antrean.append(now)
    return True


def batas_laju(maks: int = 10, jendela_detik: float = 300, nama: str | None = None):
    """Dependency FastAPI: paling banyak `maks` permintaan per IP per endpoint
    dalam `jendela_detik`. Lewat dari itu dibalas 429.

    IP diambil dari request.client. Di production uvicorn dijalankan dengan
    --forwarded-allow-ips supaya yang terbaca IP pengunjung dari
    X-Forwarded-For, bukan IP container Caddy.

    `nama` mengunci ember laju ke satu nama tetap, bukan ke `request.url.path`.
    Wajib dipakai bila path memuat bagian yang berubah tiap request (mis.
    device_code di /kolam/{id}/devices/{device_code}); tanpa itu tiap tebakan
    jadi kunci berbeda dan batas tidak pernah tercapai. Default None = per-path,
    cocok untuk endpoint auth yang path-nya tetap.
    """

    async def periksa(request: Request) -> None:
        ip = request.client.host if request.client else "?"
        if not izinkan((ip, nama or request.url.path), maks, jendela_detik):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Terlalu banyak percobaan. Coba lagi beberapa menit lagi.",
            )

    return periksa
