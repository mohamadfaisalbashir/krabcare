"""Health check — dipakai healthcheck Docker & Caddy."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])

@router.get("/health")
async def health_check() -> dict[str, str]:
    """Balas 200 selama proses app hidup (tidak menyentuh DB)."""
    return {"status": "ok"}
