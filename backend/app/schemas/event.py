# backend/app/schemas/event.py
from typing import Optional
from pydantic import BaseModel

class EventResponse(BaseModel):
    id: str
    wall_time: str
    distA: float
    distB: float
    speedA: float
    speedB: float
    riskLevel: int
    predicted_risk: Optional[int] = None
    collision_prob: Optional[list] = None

    class Config:
        from_attributes = True
