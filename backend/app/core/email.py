"""Kirim email (reset password) pakai smtplib stdlib — tanpa dependency baru."""

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("app.core.email")


def _send_email_sync(to_email: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM_EMAIL
    msg["To"] = to_email
    msg.set_content(body)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        if settings.SMTP_USE_TLS:
            server.starttls()
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)


async def send_email(to_email: str, subject: str, body: str) -> None:
    if not settings.SMTP_HOST:
        logger.warning(
            "SMTP_HOST belum diset — email ke %s dilewati (subjek: %s).", to_email, subject
        )
        return
    await asyncio.to_thread(_send_email_sync, to_email, subject, body)
