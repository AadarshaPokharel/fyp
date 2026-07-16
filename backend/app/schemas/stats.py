# backend/app/schemas/stats.py
from pydantic import BaseModel

class StatsResponse(BaseModel):
    total_events: int
    high_risk: int
    medium_risk: int
    safe: int

    class Config:
        from_attributes = True
