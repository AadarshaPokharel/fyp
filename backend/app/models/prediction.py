# backend/app/models/prediction.py
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field
from .user import PyObjectId


class CollisionProb(BaseModel):
    """Named softmax probabilities from the ML model.

    Each value is in [0, 1] and the three values sum to ~1.0.
    """
    safe: float = Field(..., ge=0.0, le=1.0, description="Probability of SAFE outcome")
    medium: float = Field(..., ge=0.0, le=1.0, description="Probability of MEDIUM risk")
    high: float = Field(..., ge=0.0, le=1.0, description="Probability of HIGH risk")

    model_config = {
        "json_schema_extra": {
            "example": {"safe": 0.05, "medium": 0.15, "high": 0.80}
        }
    }


class PredictionBase(BaseModel):
    event_id: PyObjectId = Field(..., description="FK → iot_events._id")
    predicted_risk: int = Field(..., ge=0, le=2, description="0=safe, 1=medium, 2=high")
    collision_prob: CollisionProb = Field(
        ...,
        description="Named softmax probabilities — safe, medium, high",
    )
    scored_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    model_version: str = Field("current", description="ML model version tag")
    reviewed_by: Optional[PyObjectId] = Field(
        None,
        description="FK → users._id — policy maker who reviewed this risk score",
    )
    reviewed_at: Optional[datetime] = Field(None, description="Timestamp of review")

    model_config = {
        "populate_by_name": True,
        "json_encoders": {PyObjectId: str},
        "json_schema_extra": {
            "example": {
                "event_id": "507f1f77bcf86cd799439011",
                "predicted_risk": 2,
                "collision_prob": {"safe": 0.05, "medium": 0.15, "high": 0.80},
                "model_version": "v1.2.0",
                "reviewed_by": None,
                "reviewed_at": None,
            }
        },
    }


class PredictionInDB(PredictionBase):
    """Full prediction document as stored in MongoDB."""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")


class PredictionReviewUpdate(BaseModel):
    """Request body for a policy maker marking a prediction as reviewed."""
    reviewed_by: str = Field(..., description="User _id of the reviewer")
    reviewed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PredictionResponse(PredictionBase):
    """API response representation."""
    id: str = Field(alias="_id", examples=["507f1f77bcf86cd799439011"])
    event_id: str
    reviewed_by: Optional[str] = None

    model_config = {"populate_by_name": True}

