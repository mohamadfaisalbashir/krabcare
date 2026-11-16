import pytest
from pydantic import ValidationError

from app.schemas.user import UserRegisterIn


def daftar(sandi: str) -> UserRegisterIn:
    return UserRegisterIn(email="a@contoh.com", password=sandi, nama="A")


@pytest.mark.parametrize("sandi", ["abcdefgh", "Abcdefgh", "abcdefg!", "Ab!", "Abcdefg "])
def test_sandi_lemah_ditolak(sandi):
    with pytest.raises(ValidationError):
        daftar(sandi)


def test_sandi_kuat_diterima():
    assert daftar("Abcdefg!").password == "Abcdefg!"
