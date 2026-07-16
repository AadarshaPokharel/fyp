# backend/app/models/iot_event.py
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field
from .user import PyObjectId


class IotEventBase(BaseModel):
    wall_time: str = Field(..., description="ISO timestamp from the pipeline host machine")
    timestamp_ms: int = Field(..., description="Arduino millis() timestamp")
    distA: float = Field(..., description="Distance sensor A reading (cm)")
    distB: float = Field(..., description="Distance sensor B reading (cm)")
    vehicleA: bool = Field(..., description="Vehicle detected by sensor A")
    vehicleB: bool = Field(..., description="Vehicle detected by sensor B")
    distanceDiff: float = Field(..., description="Absolute difference between distA and distB (cm)")
    speedA: float = Field(..., description="Estimated speed at sensor A (cm/s)")
    approachingA: bool = Field(..., description="True if vehicle is approaching sensor A")
    speedB: float = Field(..., description="Estimated speed at sensor B (cm/s)")
    approachingB: bool = Field(..., description="True if vehicle is approaching sensor B")
    avgSpeed: float = Field(..., description="Average speed across both sensors (cm/s)")
    accelerationA: Optional[float] = Field(None, description="Acceleration at sensor A (cm/s²)")
    accelerationB: Optional[float] = Field(None, description="Acceleration at sensor B (cm/s²)")
    riskLevel: int = Field(..., ge=0, le=2, description="0=safe, 1=medium, 2=high")
    inserted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # TTL field — only set on riskLevel=0 docs; MongoDB auto-deletes when expired
    expires_at: Optional[datetime] = Field(None, description="Auto-delete timestamp (safe docs only)")

    model_config = {
        "populate_by_name": True,
        "json_encoders": {PyObjectId: str},
        "json_schema_extra": {
            "example": {
                "wall_time": "2026-03-28T10:00:00.000",
                "timestamp_ms": 123456,
                "distA": 45.2,
                "distB": 80.1,
                "vehicleA": True,
                "vehicleB": False,
                "distanceDiff": 34.9,
                "speedA": 12.5,
                "approachingA": True,
                "speedB": 0.0,
                "approachingB": False,
                "avgSpeed": 6.25,
                "accelerationA": 1.2,
                "accelerationB": 0.0,
                "riskLevel": 1,
            }
        },
    }


class IotEventInDB(IotEventBase):
    """Full event document as stored in MongoDB."""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")


class IotEventResponse(IotEventBase):
    """API response representation."""
    id: str = Field(alias="_id", examples=["507f1f77bcf86cd799439011"])

    model_config = {"populate_by_name": True}
