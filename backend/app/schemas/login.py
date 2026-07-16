# backend/app/schemas/login.py
from pydantic import BaseModel
from .user import UserProfileSchema

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    user_id: str
    is_active: bool
    profile: UserProfileSchema

    class Config:
        from_attributes = True
