# backend/app/models/download_request.py
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field, model_validator
from .user import PyObjectId

VALID_STATUSES = {"pending", "approved", "rejected", "expired", "ready", "failed"}


class DownloadRequestBase(BaseModel):
    user_id: PyObjectId = Field(..., description="FK → users._id — who made the request")
    # Suggestion #2: datetime instead of str for proper range queries
    date_from: datetime = Field(..., description="Start of requested data range (UTC)")
    date_to: datetime = Field(..., description="End of requested data range (UTC)")
    status: str = Field(..., description="pending | approved | rejected | ready | failed | expired")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    approved_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    # Suggestion #1: approved_by is a FK, not a username string
    approved_by: Optional[PyObjectId] = Field(None, description="FK → users._id — admin who approved")
    rejected_by: Optional[PyObjectId] = Field(None, description="FK → users._id — admin who rejected")
    file_key: Optional[str] = Field(None, description="Storage-relative path key for the generated CSV (e.g. '{id}.csv')")
    file_url: Optional[str] = Field(None, description="Relative serve URL for the generated CSV (e.g. '/downloads/{id}/file')")
    expires_at: Optional[datetime] = Field(None, description="When the download link expires")

    @model_validator(mode="after")
    def check_dates(self):
        if self.date_from >= self.date_to:
            raise ValueError("date_from must be before date_to")
        return self

    @model_validator(mode="after")
    def check_status(self):
        if self.status not in VALID_STATUSES:
            raise ValueError(f"status must be one of {VALID_STATUSES}")
        return self

    model_config = {
        "populate_by_name": True,
        "json_encoders": {PyObjectId: str},
    }


class DownloadRequestCreate(BaseModel):
    """Request body sent by a policy maker — minimal fields."""
    date_from: datetime = Field(..., examples=["2026-03-01T00:00:00Z"])
    date_to: datetime = Field(..., examples=["2026-03-28T23:59:59Z"])

    @model_validator(mode="after")
    def check_dates(self):
        if self.date_from >= self.date_to:
            raise ValueError("date_from must be before date_to")
        return self

    model_config = {
        "json_schema_extra": {
            "example": {
                "date_from": "2026-03-01T00:00:00Z",
                "date_to": "2026-03-28T23:59:59Z",
            }
        }
    }


class DownloadRequestApprove(BaseModel):
    """Request body sent by an admin to approve a download request."""
    file_key: str = Field(..., description="Storage-relative CSV file key")
    file_url: str = Field(..., description="Relative serve URL for the CSV")
    expires_at: datetime = Field(..., description="When this download link should expire")


class DownloadRequestInDB(DownloadRequestBase):
    """Full document as stored in MongoDB."""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")


class DownloadRequestResponse(BaseModel):
    """API response — all ObjectIds serialized to strings."""
    id: str = Field(alias="_id")
    user_id: str
    date_from: datetime
    date_to: datetime
    status: str
    created_at: datetime
    approved_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    rejected_by: Optional[str] = None
    file_key: Optional[str] = None
    file_url: Optional[str] = None
    expires_at: Optional[datetime] = None

    model_config = {"populate_by_name": True}
