# backend/app/models/audit_log.py
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from .user import PyObjectId


class AuditLogBase(BaseModel):
    user_id: PyObjectId = Field(..., description="FK → users._id — who performed the action")
    username: Optional[str] = Field(None, description="Username of the acting user at event time")
    action: str = Field(
        ...,
        description="Action identifier, e.g. 'create_user', 'approve_download', 'login'",
        examples=["approve_download"],
    )
    # Suggestion #5: target entity fields so you can query the full history of any document
    target_collection: Optional[str] = Field(
        None,
        description="MongoDB collection the action targeted, e.g. 'download_requests'",
        examples=["download_requests"],
    )
    target_id: Optional[PyObjectId] = Field(
        None,
        description="FK → the _id of the targeted document",
    )
    details: Optional[Dict[str, Any]] = Field(
        None,
        description="Arbitrary extra context (before/after values, query params, etc.)",
    )
    ip: Optional[str] = Field(None, description="Client IP address", examples=["192.168.1.1"])
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {
        "populate_by_name": True,
        "json_encoders": {PyObjectId: str},
        "json_schema_extra": {
            "example": {
                "user_id": "507f1f77bcf86cd799439011",
                "action": "approve_download",
                "target_collection": "download_requests",
                "target_id": "65a1f2b3c4d5e6f7a8b9c0d1",
                "details": {"status_before": "pending", "status_after": "approved"},
                "ip": "192.168.1.42",
            }
        },
    }


class AuditLogInDB(AuditLogBase):
    """Full audit log document as stored in MongoDB."""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")


class AuditLogResponse(BaseModel):
    """API response — all ObjectIds serialized to strings."""
    id: str = Field(alias="_id")
    user_id: str
    username: Optional[str] = None
    action: str
    target_collection: Optional[str] = None
    target_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    ip: Optional[str] = None
    timestamp: datetime

    model_config = {"populate_by_name": True}
