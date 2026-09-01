"""Buat user + rak (kolam) baru lewat API, untuk uji manual isolasi antar user.

Jalankan (backend harus up: `docker compose up -d`):
    python scripts/seed_uji_isolasi.py                       # user default
    python scripts/seed_uji_isolasi.py budi@test.local "Rak Budi"

Lalu login di web pakai kredensial yang dicetak, dan pastikan dashboard-nya cuma
memuat rak miliknya sendiri. Versi otomatisnya: backend/tests/test_kolam_isolation.py
"""

import json
import sys
import urllib.error
import urllib.request

BASE = "http://localhost:8000/api/v1"
PASSWORD = "testpass123"  # minimal 8 karakter (UserRegisterIn)

email = sys.argv[1] if len(sys.argv) > 1 else "uji-b@test.local"
nama_rak = sys.argv[2] if len(sys.argv) > 2 else "Rak Uji B"


def call(path, body=None, token=None, method=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()
    return json.loads(raw) if raw else None


try:
    call("/auth/register", {"email": email, "password": PASSWORD, "nama": email.split("@")[0]})
    print(f"user baru  : {email}")
except urllib.error.HTTPError as exc:
    if exc.code != 400:  # 400 = email sudah terdaftar, tinggal dipakai
        raise
    print(f"user sudah ada: {email}")

token = call("/auth/login", {"email": email, "password": PASSWORD})["access_token"]
kolam = call("/kolam", {"nama": nama_rak}, token=token)

print(f"password   : {PASSWORD}")
print(f"rak baru   : id={kolam['id']} nama={kolam['nama']}")
print("rak terlihat oleh user ini:", [k["nama"] for k in call("/kolam", token=token)])
