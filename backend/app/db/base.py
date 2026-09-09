"""Base declarative SQLAlchemy, semua model di app/models wajib mewarisi ini
supaya tabelnya terdaftar di metadata & terbaca Alembic autogenerate."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
