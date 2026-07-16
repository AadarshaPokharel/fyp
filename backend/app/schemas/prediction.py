# backend/app/schemas/prediction.py
from typing import List
from pydantic import BaseModel

class PredictionResponse(BaseModel):
    id: str
    event_id: str
    predicted_risk: int
    collision_prob: List[float]
    scored_at: str

    class Config:
        from_attributes = True
