import enum


class DeviceType(str, enum.Enum):
    SLAVE_NODE = "slave_node"
    MASTER_NODE = "master_node"
    GATEWAY = "gateway"


class WaterQualityCategory(str, enum.Enum):
    BAIK = "baik"
    SEDANG = "sedang"
    BURUK = "buruk"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
