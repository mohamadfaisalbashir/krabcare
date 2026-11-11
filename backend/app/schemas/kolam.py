"""Schema kolam (unit budidaya / rak vertikal)."""

from datetime import datetime

from pydantic import BaseModel, Field


class KolamCreateIn(BaseModel):
    nama: str = Field(min_length=1)
    #: Satu kolam = satu rak = satu device, jadi device-nya ditentukan sekalian
    #: saat kolam dibuat. Keduanya satu transaksi: kode device yang salah ikut
    #: membatalkan pembuatan kolamnya, supaya tidak ada kolam yatim.
    device_code: str = Field(min_length=1)


class KolamUpdateIn(BaseModel):
    nama: str = Field(min_length=1)


class KolamUrutanIn(BaseModel):
    #: Id kolam dalam urutan tampil yang baru, dari atas ke bawah.
    kolam_ids: list[int]


class KolamOut(BaseModel):
    id: int
    nama: str
    is_active: bool
    urutan: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
