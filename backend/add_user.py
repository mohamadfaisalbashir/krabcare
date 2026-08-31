import asyncio
from app.core.security import hash_password
from app.db.session import async_engine
from sqlalchemy import text

async def add_dummy_user():
    email = "admin@kepiting.com"
    password = "password123"
    nama = "Admin Tambak"
    role = "admin"
    
    hashed = hash_password(password)
    
    try:
        async with async_engine.begin() as conn:
            await conn.execute(
                text("""
                    INSERT INTO users (email, password_hash, nama, role) 
                    VALUES (:e, :p, :n, :r) 
                    ON CONFLICT (email) DO NOTHING
                """),
                {"e": email, "p": hashed, "n": nama, "r": role}
            )
        print(f"✅ Berhasil membuat akun:\nEmail: {email}\nPassword: {password}")
    except Exception as e:
        print(f"❌ Gagal: {e}")
    finally:
        await async_engine.dispose()

if __name__ == "__main__":
    asyncio.run(add_dummy_user())
