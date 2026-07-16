from typing import Optional, Any
from pydantic import BaseModel

class UserProfileSchema(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    profile_picture: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    job_title: Optional[str] = None
    location: Optional[str] = None
    personal: Optional[Any] = None
    family: Optional[Any] = None
    address: Optional[Any] = None

    class Config:
        extra = "allow"  # Never strip unknown profile fields

class UserResponse(BaseModel):
    id: str
    username: str
    email: Optional[str]
    role: str
    is_active: bool
    profile: UserProfileSchema

    class Config:
        from_attributes = True
