# backend/app/models/security.py
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from typing import Optional
from .user import PyObjectId

class TokenDenylist(BaseModel):
    """
    Model for tracking revoked JWT tokens.
    """
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    jti: str = Field(..., description="Unique JWT Identifier (UUID)")
    expires_at: datetime = Field(..., description="UTC timestamp when the token expires")

    model_config = {
        "populate_by_name": True,
        "json_encoders": {PyObjectId: str},
    }

class UserRole(BaseModel):
    """
    Model for defining system roles and associated metadata.
    """
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    name: str = Field(..., pattern="^(admin|policy_maker)$", description="Role name identifier")
    description: Optional[str] = Field(None, description="Human-readable description of the role")
    permissions: list[str] = Field(default_factory=list, description="List of granular permissions strings")

    model_config = {
        "populate_by_name": True,
        "json_encoders": {PyObjectId: str},
    }
