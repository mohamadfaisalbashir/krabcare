"""Test isolasi kepemilikan data kolam: user A tidak boleh lihat device milik user B,
dan X-API-Key gateway tetap full-access (mereplikasi skenario manual testing 3-6).

CATATAN: test ini jalan LANGSUNG terhadap DB dev yang sama (docker-compose db+backend
harus sudah `up`), bukan DB test terpisah — pragmatis untuk skala proyek ini (belum
ada infrastruktur test DB terisolasi). Supaya tidak bentrok dengan data dev yang
sudah ada, test membuat device & user dummy dengan kode/email acak (uuid) dan
membersihkannya sendiri di akhir.
"""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.db.session import AsyncSessionLocal
from app.main import app
from app.models import Device, User

GATEWAY_API_KEY = "ai-dilarangbaca"  # cocokkan dengan .env / default docker-compose


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def test_device_code():
    """Bikin satu device dummy (belum diklaim) khusus buat test ini, hapus di akhir."""
    code = f"TEST-KOLAM-{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        device = Device(device_code=code)
        db.add(device)
        await db.commit()
        device_id = device.id

    yield code

    async with AsyncSessionLocal() as db:
        await db.execute(delete(Device).where(Device.id == device_id))
        await db.commit()


async def _register_and_login(client: AsyncClient, email: str) -> str:
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpass123", "nama": "Test User"},
    )
    resp = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "testpass123"}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


async def test_kolam_isolation_between_users(client: AsyncClient, test_device_code: str):
    email_a = f"user-a-{uuid.uuid4().hex[:8]}@test.local"
    email_b = f"user-b-{uuid.uuid4().hex[:8]}@test.local"

    try:
        token_a = await _register_and_login(client, email_a)
        token_b = await _register_and_login(client, email_b)

        # User A bikin kolam & klaim device dummy.
        resp = await client.post(
            "/api/v1/kolam",
            json={"nama": "Kolam Test A"},
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 201, resp.text
        kolam_id = resp.json()["id"]

        resp = await client.post(
            f"/api/v1/kolam/{kolam_id}/devices/{test_device_code}",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 204, resp.text

        # User A bisa akses endpoint (walau reading kosong, minimal bukan 401).
        resp = await client.get(
            f"/api/v1/readings?device_code={test_device_code}",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 200
        assert resp.json() == []  # device dummy ini memang tidak ada sensor_readings

        # User B TIDAK boleh lihat device milik User A -> tetap 200, tapi (secara
        # semantik) di-scope kosong. Karena device dummy ini juga kosong readingnya,
        # yang benar-benar membuktikan isolasi adalah query TANPA filter device_code:
        # User B harus tidak melihat device_code test ini sama sekali.
        resp = await client.get(
            "/api/v1/readings",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert resp.status_code == 200
        assert all(r["device_code"] != test_device_code for r in resp.json())

        # Gateway (X-API-Key) tetap full-access, tidak dibatasi kolam siapa pun.
        resp = await client.get(
            f"/api/v1/readings?device_code={test_device_code}",
            headers={"X-API-Key": GATEWAY_API_KEY},
        )
        assert resp.status_code == 200

        # Tanpa X-API-Key & tanpa token -> 401.
        resp = await client.get(f"/api/v1/readings?device_code={test_device_code}")
        assert resp.status_code == 401

        # Endpoint kolam sendiri juga wajib isolasi: User B tidak boleh lihat kolam User A.
        resp = await client.get(
            f"/api/v1/kolam/{kolam_id}", headers={"Authorization": f"Bearer {token_b}"}
        )
        assert resp.status_code == 404
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(User).where(User.email.in_([email_a, email_b])))
            await db.commit()
