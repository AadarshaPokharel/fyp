# backend/app/models/user.py
from datetime import datetime, timezone
from typing import Optional, Annotated
from bson import ObjectId
from pydantic import BaseModel, EmailStr, Field, GetCoreSchemaHandler
from pydantic_core import core_schema


class PyObjectId(ObjectId):
    """
    Pydantic v2-compatible ObjectId.
    Serialises to string in JSON (Swagger shows it as 'string' type).
    """
    @classmethod
    def __get_pydantic_core_schema__(
        cls, source_type: type, handler: GetCoreSchemaHandler
    ) -> core_schema.CoreSchema:
        return core_schema.no_info_plain_validator_function(
            cls._validate,
            serialization=core_schema.to_string_ser_schema(),
        )

    @classmethod
    def _validate(cls, v):
        if isinstance(v, ObjectId):
            return v
        if isinstance(v, str) and ObjectId.is_valid(v):
            return ObjectId(v)
        raise ValueError(f"Invalid ObjectId: {v!r}")

    @classmethod
    def __get_pydantic_json_schema__(cls, schema, handler):
        return {"type": "string", "example": "507f1f77bcf86cd799439011"}


# ── Reusable annotated type (use this in all models) ──────────────────────────
ObjId = Annotated[PyObjectId, Field(default_factory=PyObjectId)]


class PersonalDetails(BaseModel):
    full_name: str = Field(..., min_length=1)
    personal_number: str = Field(..., min_length=1)
    citizenship_no: Optional[str] = None
    nid_number: Optional[str] = Field(None, pattern=r"^\d{10}$")
    phone_number: Optional[str] = None
    email: EmailStr
    sex: str = Field(..., pattern="^(male|female|other)$")


class FamilyDetails(BaseModel):
    father_name: str
    father_phone: Optional[str] = None
    mother_name: str
    mother_phone: Optional[str] = None
    spouse_name: Optional[str] = None
    grandfather_name: str
    grandmother_name: str


class AddressDetails(BaseModel):
    current_posting_address: str
    permanent_living_address: str
    temporary_living_address: str


class UserProfile(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    bio: Optional[str] = Field(None, max_length=500)
    profile_picture: Optional[str] = Field(
        None, description="Cloudinary URL of profile picture"
    )
    phone: Optional[str] = Field(None, max_length=20)
    department: Optional[str] = Field(None, max_length=100)
    job_title: Optional[str] = Field(None, max_length=100)
    location: Optional[str] = Field(None, max_length=100)
    
    # Credentials for Policy Makers
    personal: Optional[PersonalDetails] = None
    family: Optional[FamilyDetails] = None
    address: Optional[AddressDetails] = None
    documents: Optional[dict] = None


class AbstractUserBase(BaseModel):
    """Abstract base user model with common attributes."""
    username: str = Field(..., min_length=3, max_length=50, examples=["aadarsha"])
    email: Optional[EmailStr] = Field(None, examples=["aadarsha@example.com"])
    profile: UserProfile
    is_active: bool = Field(True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {
        "populate_by_name": True,
        "json_encoders": {ObjectId: str},
    }

class AdminUser(AbstractUserBase):
    """Admin specific user model."""
    role: str = Field("admin", pattern="^admin$")

class PolicyMakerUser(AbstractUserBase):
    """Policy Maker specific user model."""
    role: str = Field("policy_maker", pattern="^policy_maker$")

class UserBase(AbstractUserBase):
    """Base user for general validation."""
    role: str = Field(..., pattern="^(admin|policy_maker)$", examples=["admin"])


class UserCreate(UserBase):
    """Request body for creating a new user (admin only)."""
    password: str = Field(..., min_length=8, examples=["str0ngP@ss"])


class UserUpdate(BaseModel):
    """Partial update — all fields optional."""
    email: Optional[EmailStr] = None
    role: Optional[str] = Field(None, pattern="^(admin|policy_maker)$")
    is_active: Optional[bool] = None


class UserInDB(UserBase):
    """Full user document as stored in MongoDB."""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    hashed_password: str
    # Only admins can create users; self-reference enforced at API layer
    created_by: Optional[PyObjectId] = Field(None, description="Admin user _id who created this account")
    last_login_at: Optional[datetime] = Field(None, description="UTC timestamp of the user's last successful login")


class UserResponse(UserBase):
    """Safe public representation — no password hash."""
    id: str = Field(alias="_id", examples=["507f1f77bcf86cd799439011"])
    created_by: Optional[str] = None

    model_config = {"populate_by_name": True}
