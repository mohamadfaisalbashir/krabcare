"""Re-export schema Pydantic — suffix In = request body, Out = response."""

from app.schemas.ammonia import AmmoniaRiskLogOut, AmmoniaRiskOut, DeviceAmmoniaOut
from app.schemas.device import DeviceOut
from app.schemas.fuzzy import (
    DevicePredictionsOut,
    FuzzyClassificationIn,
    FuzzyClassificationOut,
    FuzzyPredictionIn,
    FuzzyPredictionOut,
    LatestQualityOut,
    QualityIngestIn,
    QualityIngestResultOut,
)
from app.schemas.kolam import KolamCreateIn, KolamOut, KolamUpdateIn
from app.schemas.notification import NotificationOut, PushTokenRegisterIn
from app.schemas.sensor_reading import (
    IngestResultOut,
    SensorReadingBatchIn,
    SensorReadingIn,
    SensorReadingOut,
    SkippedDuplicateOut,
)
from app.schemas.user import (
    ForgotPasswordIn,
    PasswordChangeIn,
    ResetPasswordIn,
    TokenOut,
    UserLoginIn,
    UserOut,
    UserProfileUpdateIn,
    UserRegisterIn,
)

__all__ = [
    "AmmoniaRiskLogOut",
    "AmmoniaRiskOut",
    "DeviceAmmoniaOut",
    "DeviceOut",
    "DevicePredictionsOut",
    "FuzzyClassificationIn",
    "FuzzyClassificationOut",
    "FuzzyPredictionIn",
    "FuzzyPredictionOut",
    "LatestQualityOut",
    "QualityIngestIn",
    "QualityIngestResultOut",
    "KolamCreateIn",
    "KolamOut",
    "KolamUpdateIn",
    "NotificationOut",
    "PushTokenRegisterIn",
    "IngestResultOut",
    "SensorReadingBatchIn",
    "SensorReadingIn",
    "SensorReadingOut",
    "SkippedDuplicateOut",
    "ForgotPasswordIn",
    "PasswordChangeIn",
    "ResetPasswordIn",
    "TokenOut",
    "UserLoginIn",
    "UserOut",
    "UserProfileUpdateIn",
    "UserRegisterIn",
]
