from logging.config import fileConfig

import sqlalchemy as sa
from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# JANGAN meng-import app.main di sini: dia memicu scheduler dan meng-import
# ml.fuzzy secara transitif, tidak dibutuhkan migrasi dan bisa bikin gagal.
from app.core.config import settings
from app.db.base import Base
import app.models  # noqa: F401, wajib, supaya semua tabel terdaftar di metadata

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# URL diambil dari aplikasi, bukan alembic.ini, supaya kredensial tidak ter-commit.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL_SYNC)

target_metadata = Base.metadata


def include_object(object, name, type_, reflected, compare_to):
    """Saring objek yang bukan bikinan kita supaya autogenerate tidak menawarkan DROP.

    Index `*_time_idx` dibuat otomatis create_hypertable() TimescaleDB, jadi
    sengaja tidak dideklarasikan di model, kalau dideklarasikan malah bentrok.
    """
    if type_ == "index" and reflected and name and name.endswith("_time_idx"):
        return False
    return True


def compare_type(context, inspected_column, metadata_column, inspected_type, metadata_type):
    """Pengecualian yang DISENGAJA: TEXT (DB) vs Enum non-native (model) dianggap sama.

    `devices.device_type` & `users.role` di DB bertipe TEXT + CHECK, sedangkan
    SAEnum(native_enum=False) dirender jadi VARCHAR(n) + CHECK. Di Postgres
    keduanya identik, jadi tidak perlu migrasi kosmetik.

    Sengaja sesempit mungkin, kombinasi lain balik None (default Alembic) supaya
    perubahan tipe yang sungguhan tetap terdeteksi.
    """
    if (
        isinstance(inspected_type, sa.Text)
        and isinstance(metadata_type, sa.Enum)
        and not metadata_type.native_enum
    ):
        return False
    return None

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        compare_type=compare_type,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            compare_type=compare_type,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
