"""Paginasi LIMIT/OFFSET + filter parameter & status di GET /readings.

Sama seperti test_kolam_isolation.py: jalan LANGSUNG ke DB dev (docker compose
db+backend harus up), data dummy dibuat dengan suffix uuid dan dibersihkan
sendiri di blok finally.
"""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.db.session import AsyncSessionLocal
from app.main import app
from app.models import Device, User

GATEWAY_API_KEY = "ai-dilarangbaca"  # cocokkan dengan .env / default docker-compose

# ph: 6.0 & 9.5 di luar toleransi (bahaya), 6.6 di dalam toleransi tapi di luar
# optimal (waspada), 7.8 & 8.0 optimal (aman). Baris terakhir sengaja tanpa ph —
# ia harus hilang begitu param=ph dipakai, bukan ikut menghabiskan jatah halaman.
SAMPEL = [
    ("2026-08-01T01:00:00+00:00", 7.8),
    ("2026-08-01T02:00:00+00:00", 6.6),
    ("2026-08-01T03:00:00+00:00", 9.5),
    ("2026-08-01T04:00:00+00:00", 8.0),
    ("2026-08-01T05:00:00+00:00", 6.0),
]
TANPA_PH = "2026-08-01T06:00:00+00:00"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def device_code():
    code = f"TEST-PAGE-{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        device = Device(device_code=code)
        db.add(device)
        await db.commit()
        device_id = device.id

    yield code

    async with AsyncSessionLocal() as db:
        # sensor_readings.device_id FK-nya CASCADE, jadi readingnya ikut terhapus.
        await db.execute(delete(Device).where(Device.id == device_id))
        await db.commit()


async def _login(client: AsyncClient, email: str) -> dict[str, str]:
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpass123", "nama": "Test Page"},
    )
    resp = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "testpass123"}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_paginasi_dan_filter_readings(client: AsyncClient, device_code: str):
    email = f"page-{uuid.uuid4().hex[:8]}@test.local"

    try:
        head = await _login(client, email)

        # Kolam + klaim device, supaya user ini boleh membaca readingnya.
        resp = await client.post("/api/v1/kolam", json={"nama": "Rak Paginasi"}, headers=head)
        assert resp.status_code == 201, resp.text
        kolam_id = resp.json()["id"]
        resp = await client.post(
            f"/api/v1/kolam/{kolam_id}/devices/{device_code}", headers=head
        )
        assert resp.status_code == 204, resp.text

        resp = await client.post(
            "/api/v1/ingest/readings",
            headers={"X-API-Key": GATEWAY_API_KEY},
            json={
                "readings": [
                    {"device_code": device_code, "time": t, "ph": ph} for t, ph in SAMPEL
                ]
                + [{"device_code": device_code, "time": TANPA_PH, "temperature_c": 29.0}]
            },
        )
        assert resp.status_code == 201, resp.text

        async def ambil(**q: object) -> list[dict]:
            resp = await client.get(
                "/api/v1/readings",
                params={"device_code": device_code, **q},
                headers=head,
            )
            assert resp.status_code == 200, resp.text
            return resp.json()

        # --- param membuang baris yang phnya NULL --------------------------
        semua = await ambil(param="ph", limit=100)
        assert len(semua) == len(SAMPEL), semua
        assert TANPA_PH not in [r["time"] for r in semua]

        # --- halaman tidak tumpang tindih, urutan tetap turun ---------------
        h1 = await ambil(param="ph", limit=2, offset=0)
        h2 = await ambil(param="ph", limit=2, offset=2)
        h3 = await ambil(param="ph", limit=2, offset=4)
        assert [len(h1), len(h2), len(h3)] == [2, 2, 1]

        waktu = [r["time"] for r in h1 + h2 + h3]
        assert len(set(waktu)) == len(waktu), f"ada baris dobel antar halaman: {waktu}"
        assert waktu == sorted(waktu, reverse=True), waktu
        assert waktu == [r["time"] for r in semua]

        # --- filter status memakai ambang Tabel 2.1 -------------------------
        bahaya = await ambil(param="ph", status="bahaya", limit=100)
        assert sorted(r["ph"] for r in bahaya) == [6.0, 9.5]

        waspada = await ambil(param="ph", status="waspada", limit=100)
        assert sorted(r["ph"] for r in waspada) == [6.6]

        aman = await ambil(param="ph", status="aman", limit=100)
        assert sorted(r["ph"] for r in aman) == [7.8, 8.0]

        # Filter status pun ikut dipaginasi, bukan disaring setelah LIMIT.
        assert len(await ambil(param="ph", status="bahaya", limit=1)) == 1

        # --- status tanpa param tidak punya arti ----------------------------
        resp = await client.get(
            "/api/v1/readings", params={"status": "aman"}, headers=head
        )
        assert resp.status_code == 422, resp.text
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(User).where(User.email == email))
            await db.commit()
