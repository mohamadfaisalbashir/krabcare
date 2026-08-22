"""GET/POST kecil berbasis urllib, dipakai bersama oleh script-script ml/scripts/*.py
untuk bicara ke API sismon_kepiting (X-API-Key gateway).

Standalone, tanpa dependency eksternal — konsisten dengan ml/scripts/*.py lain.
"""

import json
import urllib.error
import urllib.request


def http_get(url: str, api_key: str) -> list[dict]:
    req = urllib.request.Request(url, headers={"X-API-Key": api_key})
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def http_post(url: str, api_key: str, payload: dict) -> dict:
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
