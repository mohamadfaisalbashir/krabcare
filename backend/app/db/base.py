"""Base declarative SQLAlchemy. Semua model di app/models harus mewarisi ini
supaya tabelnya terdaftar di metadata dan terbaca Alembic autogenerate."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
