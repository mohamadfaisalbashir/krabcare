"""Base class declarative SQLAlchemy.

Semua model di app/models harus mewarisi `Base` ini agar terdeteksi oleh
Alembic saat autogenerate migrasi.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
