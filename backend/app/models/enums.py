"""Enum bersama model & schema. Nilai string-nya = nilai yang tersimpan di DB."""

import enum


class DeviceType(str, enum.Enum):
    SLAVE_NODE = "slave_node"
    MASTER_NODE = "master_node"
    GATEWAY = "gateway"


class WaterQualityCategory(str, enum.Enum):
    """Kategori hasil Mamdani: aman/waspada/bahaya dipetakan ke baik/sedang/buruk."""

    BAIK = "baik"
    SEDANG = "sedang"
    BURUK = "buruk"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
