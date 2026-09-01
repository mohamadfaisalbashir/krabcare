"""Setup bersama untuk test yang menyentuh DB.

`app.db.session.engine` dibuat sekali saat modul di-impor, dan pool koneksinya
menempel ke event loop yang pertama memakainya. pytest-asyncio memberi setiap
test loop-nya sendiri (asyncio_default_fixture_loop_scope = function), jadi test
KEDUA dan seterusnya mewarisi koneksi milik loop yang sudah mati dan gagal dengan
asyncpg InterfaceError.

Selama berkas test ini cuma berisi satu test, cacatnya tak pernah terlihat.
Membuang pool sesudah tiap test membuat test berikutnya membuka koneksi baru di
loop-nya sendiri.
"""

import pytest

from app.db.session import engine


@pytest.fixture(autouse=True)
async def _buang_pool_koneksi():
    yield
    await engine.dispose()
