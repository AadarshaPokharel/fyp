# backend/app/services/prediction_service.py
import app.db as db

class PredictionService:
    
    @staticmethod
    async def get_predictions(limit: int = 100) -> list:
        """Get predictions."""
        cursor = db.predictions_collection.find().sort("scored_at", -1).limit(limit)
        return await cursor.to_list(length=limit)
    
    @staticmethod
    async def count_by_risk(risk_level: int) -> int:
        """Count predictions by risk level."""
        return await db.predictions_collection.count_documents({"predicted_risk": risk_level})
    
    @staticmethod
    async def get_stats() -> dict:
        """Get prediction statistics."""
        return {
            "high_risk": await PredictionService.count_by_risk(2),
            "medium_risk": await PredictionService.count_by_risk(1),
            "safe": await PredictionService.count_by_risk(0)
        }
