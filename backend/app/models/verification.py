# backend/app/models/verification.py
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field
from enum import Enum
from .user import PyObjectId, PersonalDetails, FamilyDetails, AddressDetails


class VerificationStatus(str, Enum):
    PENDING_INITIAL = "pending_initial_approval"
    REJECTED_INITIAL = "rejected_initial"
    APPROVED_INITIAL = "approved_initial"  # Waiting for credentials
    CREDENTIALS_SUBMITTED = "credentials_submitted"
    REJECTED_CREDENTIALS = "rejected_credentials"
    APPROVED_CREDENTIALS = "approved_credentials"  # Waiting for password setup
    COMPLETED = "completed"
    AUTO_REJECTED = "auto_rejected"


class DocumentUploads(BaseModel):
    citizenship_pdf: Optional[str] = None      # Cloudinary public_id
    traffic_id: Optional[str] = None           # Cloudinary public_id
    education_certificate: Optional[str] = None  # Cloudinary public_id
    health_certificate: Optional[str] = None   # Cloudinary public_id
    training_certificate: Optional[str] = None # Cloudinary public_id


class PMCredentials(BaseModel):
    personal: Optional[PersonalDetails] = None
    family: Optional[FamilyDetails] = None
    address: Optional[AddressDetails] = None
    documents: Optional[DocumentUploads] = None
    is_draft: bool = True


class PMVerificationRequest(BaseModel):
    email: EmailStr
    status: VerificationStatus = VerificationStatus.PENDING_INITIAL
    token: Optional[str] = None
    token_expires_at: Optional[datetime] = None
    resend_count: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    credentials: Optional[PMCredentials] = None
    # Track password setup token too
    setup_token: Optional[str] = None
    setup_token_expires_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_encoders = {PyObjectId: str}


class PMVerificationRequestInDB(PMVerificationRequest):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
