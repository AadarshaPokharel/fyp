# backend/app/services/event_service.py
from datetime import datetime, timezone, timedelta
import app.db as db


class EventService:

    @staticmethod
    async def get_events(limit: int = 100) -> list:
        """Get events with predictions aggregated."""
        pipeline = [
            {
                "$lookup": {
                    "from": "predictions",
                    "localField": "_id",
                    "foreignField": "event_id",
                    "as": "pred",
                }
            },
            {"$unwind": {"path": "$pred", "preserveNullAndEmptyArrays": True}},
            {"$sort": {"inserted_at": -1}},
            {"$limit": limit},
            {
                "$project": {
                    "id": {"$toString": "$_id"},
                    "wall_time": 1,
                    "distA": 1,
                    "distB": 1,
                    "speedA": 1,
                    "speedB": 1,
                    "avgSpeed": 1,
                    "riskLevel": 1,
                    "inserted_at": 1,
                    "predicted_risk": "$pred.predicted_risk",
                    "collision_prob": "$pred.collision_prob",
                }
            },
        ]
        cursor = db.iot_events_collection.aggregate(pipeline)
        return await cursor.to_list(length=limit)

    @staticmethod
    async def count_events() -> int:
        return await db.iot_events_collection.count_documents({})

    @staticmethod
    async def get_risk_stats() -> dict:
        """
        Counts safe / medium / high risk events from the iot_events collection
        using the sensor-measured riskLevel field directly. This gives an accurate
        picture of raw sensor data distribution.
        """
        pipeline = [
            {
                "$group": {
                    "_id": "$riskLevel",
                    "count": {"$sum": 1}
                }
            }
        ]
        cursor = db.iot_events_collection.aggregate(pipeline)
        rows = await cursor.to_list(length=10)
        result = {"safe": 0, "medium_risk": 0, "high_risk": 0}
        for row in rows:
            level = row["_id"]
            if level == 0:
                result["safe"] = row["count"]
            elif level == 1:
                result["medium_risk"] = row["count"]
            elif level == 2:
                result["high_risk"] = row["count"]
        return result

    @staticmethod
    async def get_avg_speed() -> float:
        """Calculates the average speed across all logged IoT events."""
        pipeline = [
            {"$group": {"_id": None, "avgSpeed": {"$avg": "$avgSpeed"}}}
        ]
        cursor = db.iot_events_collection.aggregate(pipeline)
        res = await cursor.to_list(length=1)
        return res[0]["avgSpeed"] if res else 0.0

    @staticmethod
    async def get_hourly_timeseries(hours: int = 24) -> list:
        """
        Returns a list of {hour, safe, medium, high} dicts for the last N hours.
        Safe for dashboards even when iot_events is empty.
        """
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        pipeline = [
            {"$match": {"inserted_at": {"$gte": since}}},
            {
                "$group": {
                    "_id": {
                        "hour": {
                            "$dateToString": {
                                "format": "%Y-%m-%dT%H:00",
                                "date": "$inserted_at",
                            }
                        },
                        "riskLevel": "$riskLevel",
                    },
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"_id.hour": 1}},
        ]
        cursor = db.iot_events_collection.aggregate(pipeline)
        raw = await cursor.to_list(length=10000)

        # Pivot into per-hour dicts
        buckets: dict = {}
        for row in raw:
            hour = row["_id"]["hour"]
            risk = row["_id"]["riskLevel"]
            if hour not in buckets:
                buckets[hour] = {"hour": hour, "safe": 0, "medium": 0, "high": 0}
            if risk == 0:
                buckets[hour]["safe"] += row["count"]
            elif risk == 1:
                buckets[hour]["medium"] += row["count"]
            elif risk == 2:
                buckets[hour]["high"] += row["count"]

        return list(buckets.values())

