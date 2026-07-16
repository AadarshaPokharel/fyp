from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
from bson import ObjectId

class PyObjectId(str):
    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type, _handler):
        from pydantic_core import core_schema
        return core_schema.str_schema()

class PolicyState(str, Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    AWAITING_FINAL_SUBMISSION = "awaiting_final_submission"
    COMPLETED = "completed"
    REJECTED = "rejected"
    REVISED = "revised"
    CLOSED = "closed"

class PolicyBase(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    region: Optional[str] = None
    effective_date: Optional[str] = None
    duration: Optional[str] = None
    duration_unit: Optional[str] = "months"
    impact: Optional[str] = None
    supporting_documents_file_id: Optional[str] = None
    last_auto_saved_at: Optional[datetime] = None
    is_locked: bool = False

class PolicyCreate(PolicyBase):
    pass

class PolicyUpdate(PolicyBase):
    pass

class PolicyInDB(PolicyBase):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    owner_id: str
    status: PolicyState = PolicyState.DRAFT
    revision_count: int = 0
    admin_feedback: Optional[str] = None
    final_submission_file_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class PolicyResponse(PolicyBase):
    id: Optional[str] = None
    owner_id: str
    status: PolicyState
    revision_count: int
    admin_feedback: Optional[str] = None
    final_submission_file_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    duration_unit: Optional[str] = None
    
    @model_validator(mode="before")
    @classmethod
    def convert_id(cls, values):
        """Map MongoDB's _id (ObjectId) to id (str) before validation."""
        if isinstance(values, dict) and "_id" in values:
            raw_id = values["_id"]
            if raw_id is not None:
                values["id"] = str(raw_id)
        return values
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}
        from_attributes = True
