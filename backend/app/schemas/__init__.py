# backend/app/schemas/__init__.py
from .login import LoginRequest, LoginResponse
from .user import UserResponse
from .event import EventResponse
from .prediction import PredictionResponse
from .stats import StatsResponse

__all__ = [
    "LoginRequest", "LoginResponse",
    "UserResponse",
    "EventResponse",
    "PredictionResponse",
    "StatsResponse"
]
