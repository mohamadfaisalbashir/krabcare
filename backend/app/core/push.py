"""Wrapper tipis firebase-admin untuk push notification, graceful kalau belum dikonfigurasi."""

import logging

import firebase_admin
from firebase_admin import credentials, messaging

from app.core.config import settings

logger = logging.getLogger("app.core.push")
_firebase_app = None


def _get_firebase_app():
    """Inisialisasi app Firebase sekali saja (lazy). None kalau kredensial belum diset."""
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app
    if not settings.FIREBASE_CREDENTIALS_PATH:
        return None
    cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
    _firebase_app = firebase_admin.initialize_app(cred)
    return _firebase_app


def send_push(token: str, title: str, body: str) -> bool:
    """Kirim satu push ke satu token FCM. False = tidak terkirim (tidak pernah raise)."""
    app = _get_firebase_app()
    if app is None:
        logger.warning("FIREBASE_CREDENTIALS_PATH belum diset, push dilewati.")
        return False
    try:
        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body), token=token
        )
        messaging.send(message, app=app)
        return True
    except Exception:
        logger.exception("Gagal kirim push notification.")
        return False
