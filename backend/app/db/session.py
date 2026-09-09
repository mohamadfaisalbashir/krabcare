"""Engine & session SQLAlchemy async ke PostgreSQL/TimescaleDB."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG, future=True)

# Pabrik session. Dipakai get_db() (per-request) & scheduler (di luar request).
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency FastAPI: satu session DB per request, ditutup otomatis."""
    async with AsyncSessionLocal() as session:
        yield session
