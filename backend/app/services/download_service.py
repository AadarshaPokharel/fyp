# backend/app/services/download_service.py
import app.db as db
import pandas as pd
import os
from datetime import datetime, timezone, timedelta
from bson import ObjectId



class DownloadService:

    @staticmethod
    async def create_request(user_id: ObjectId, date_from: datetime, date_to: datetime) -> dict:
        doc = {
            "user_id": user_id,
            "date_from": date_from,
            "date_to": date_to,
            "status": "pending",
            "created_at": datetime.now(timezone.utc),
            "approved_at": None,
            "approved_by": None,
            "rejected_at": None,
            "rejected_by": None,
            "file_key": None,
            "file_url": None,
            "expires_at": None,
        }
        result = await db.download_requests_collection.insert_one(doc)
        return await db.download_requests_collection.find_one({"_id": result.inserted_id})

    @staticmethod
    async def list_all(skip: int = 0, limit: int = 200) -> list:
        pipeline = [
            {"$sort": {"created_at": -1}},
            {"$skip": skip},
            {"$limit": limit},
            {
                "$lookup": {
                    "from": "user",
                    "localField": "user_id",
                    "foreignField": "_id",
                    "as": "user"
                }
            },
            {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
            {
                "$addFields": {
                    "user_name": {
                        "$cond": {
                            "if": {"$and": [{"$ne": ["$user.profile.department", None]}, {"$ne": ["$user.profile.department", ""]}]},
                            "then": {"$concat": [{"$ifNull": ["$user.profile.name", "$user.username", "Unknown"]}, " - ", "$user.profile.department"]},
                            "else": {"$ifNull": ["$user.profile.name", "$user.username", "Unknown"]}
                        }
                    }
                }
            },
            {"$project": {"user": 0}}
        ]
        cursor = db.download_requests_collection.aggregate(pipeline)
        return await cursor.to_list(length=limit)

    @staticmethod
    async def list_by_user(user_id: ObjectId, skip: int = 0, limit: int = 100) -> list:
        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$sort": {"created_at": -1}},
            {"$skip": skip},
            {"$limit": limit},
            {
                "$lookup": {
                    "from": "user",
                    "localField": "user_id",
                    "foreignField": "_id",
                    "as": "user"
                }
            },
            {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
            {
                "$addFields": {
                    "user_name": {
                        "$cond": {
                            "if": {"$and": [{"$ne": ["$user.profile.department", None]}, {"$ne": ["$user.profile.department", ""]}]},
                            "then": {"$concat": [{"$ifNull": ["$user.profile.name", "$user.username", "Unknown"]}, " - ", "$user.profile.department"]},
                            "else": {"$ifNull": ["$user.profile.name", "$user.username", "Unknown"]}
                        }
                    }
                }
            },
            {"$project": {"user": 0}}
        ]
        cursor = db.download_requests_collection.aggregate(pipeline)
        return await cursor.to_list(length=limit)

    @staticmethod
    async def get_by_id(request_id: ObjectId) -> dict:
        return await db.download_requests_collection.find_one({"_id": request_id})

    @staticmethod
    async def approve(request_id: ObjectId, admin_id: ObjectId) -> dict:
        now = datetime.now(timezone.utc)
        expires = now + timedelta(days=7)

        await db.download_requests_collection.update_one(
            {"_id": request_id},
            {
                "$set": {
                    "status": "approved",
                    "approved_at": now,
                    "approved_by": admin_id,
                    "expires_at": expires
                }
            },
        )
        return await db.download_requests_collection.find_one({"_id": request_id})

    @staticmethod
    async def generate_csv(request_id: ObjectId):
        try:
            req = await db.download_requests_collection.find_one({"_id": request_id})
            if not req:
                return

            date_from = req["date_from"]
            date_to = req["date_to"]

            # 1. Fetch events + predictions using inserted_at (guaranteed BSON Date)
            pipeline = [
                {"$match": {"inserted_at": {"$gte": date_from, "$lte": date_to}}},
                {"$lookup": {
                    "from": "predictions",
                    "localField": "_id",
                    "foreignField": "event_id",
                    "as": "prediction"
                }},
                {"$unwind": {"path": "$prediction", "preserveNullAndEmptyArrays": True}}
            ]
            events = await db.iot_events_collection.aggregate(pipeline).to_list(None)

            if not events:
                await db.download_requests_collection.update_one(
                    {"_id": request_id},
                    {"$set": {"status": "failed", "error": "No data found for this range"}}
                )
                return

            # 2. Build DataFrame
            rows = []
            for e in events:
                pred = e.get("prediction", {})
                
                # Robust extraction for collision_prob (can be dict or list)
                prob_data = pred.get("collision_prob", {})
                p_safe, p_med, p_high = 0.0, 0.0, 0.0
                
                if isinstance(prob_data, dict):
                    p_safe = prob_data.get("safe", 0.0)
                    p_med  = prob_data.get("medium", 0.0)
                    p_high = prob_data.get("high", 0.0)
                elif isinstance(prob_data, list) and len(prob_data) == 3:
                    p_safe, p_med, p_high = prob_data
                
                rows.append({
                    "timestamp":      e.get("wall_time") or e.get("inserted_at"),
                    "distA":          e.get("distA"),
                    "distB":          e.get("distB"),
                    "speedA":         e.get("speedA"),
                    "speedB":         e.get("speedB"),
                    "avgSpeed":       e.get("avgSpeed"),
                    "riskLevel":      e.get("riskLevel"),
                    "predicted_risk": pred.get("predicted_risk"),
                    "prob_safe":      p_safe,
                    "prob_medium":    p_med,
                    "prob_high":      p_high,
                })
            
            df = pd.DataFrame(rows)
            csv_content = df.to_csv(index=False)

            # 3. Upload to Cloudinary
            from app.services.storage_service import storage_service
            file_key, file_url = await storage_service.upload_csv(
                csv_content, str(request_id)
            )

            # 4. Update MongoDB document
            await db.download_requests_collection.update_one(
                {"_id": request_id},
                {"$set": {
                    "status":       "ready",
                    "file_key":     file_key,
                    "file_url":     file_url,
                    "completed_at": datetime.now(timezone.utc),
                    "expires_at":   datetime.now(timezone.utc) + timedelta(days=7)
                }}
            )
        except Exception as exc:
            import logging
            logging.error(f"CSV Generation failed for {request_id}: {exc}", exc_info=True)
            await db.download_requests_collection.update_one(
                {"_id": request_id},
                {"$set": {"status": "failed", "error": str(exc)}}
            )


    @staticmethod
    async def reject(request_id: ObjectId, admin_id: ObjectId) -> dict:
        now = datetime.now(timezone.utc)
        await db.download_requests_collection.update_one(
            {"_id": request_id},
            {
                "$set": {
                    "status": "rejected",
                    "rejected_at": now,
                    "rejected_by": admin_id,
                }
            },
        )
        return await db.download_requests_collection.find_one({"_id": request_id})
