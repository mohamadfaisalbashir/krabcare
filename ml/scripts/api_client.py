"""Klien HTTP mini ke API sismon_kepiting, dipakai bersama script di folder ini.

Pakai urllib bawaan Python — script di ml/scripts/ sengaja berdiri sendiri,
tanpa dependency eksternal.
"""

import json
import urllib.error
import urllib.request


def api_get(url: str, api_key: str) -> list[dict]:
    """GET dengan header X-API-Key gateway, balas JSON yang sudah di-parse."""
    req = urllib.request.Request(url, headers={"X-API-Key": api_key})
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def api_post(url: str, api_key: str, payload: dict) -> dict:
    """POST JSON. Body error dari server ikut dilempar supaya pesannya kelihatan."""
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "X-API-Key": api_key},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(f"POST {url} -> {exc.code}: {detail}") from exc
