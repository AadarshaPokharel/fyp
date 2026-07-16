# backend/app/routes/predictions.py
from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.services import PredictionService

predictions_router = APIRouter()

@predictions_router.get("/")
async def get_predictions(
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get predictions."""
    predictions = await PredictionService.get_predictions(limit=limit)
    return {
        "count": len(predictions),
        "predictions": [
            {
                "id": str(p["_id"]),
                "event_id": str(p["event_id"]),
                "predicted_risk": p["predicted_risk"],
                "collision_prob": p["collision_prob"],
                "scored_at": p["scored_at"].isoformat()
            }
            for p in predictions
        ]
    }
