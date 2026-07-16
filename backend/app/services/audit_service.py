# backend/app/services/audit_service.py
from datetime import datetime, timezone
import re
from bson import ObjectId
import app.db as db


class AuditService:

    @staticmethod
    async def log_action(
        user_id: ObjectId,
        username: str,
        action: str,
        details: dict = None,
        ip: str = None,
        target_collection: str = None,
        target_id: ObjectId = None,
    ) -> None:
        doc = {
            "user_id": user_id,
            "username": username,
            "action": action,
            "details": details or {},
            "ip": ip,
            "target_collection": target_collection,
            "target_id": target_id,
            "timestamp": datetime.now(timezone.utc),
        }
        await db.audit_logs_collection.insert_one(doc)

    @staticmethod
    async def get_all_logs(limit: int = 200, skip: int = 0, search: str = None) -> list:
        filter_query = {}
        if search:
            safe_search = re.escape(search)
            regex = {"$regex": safe_search, "$options": "i"}
            filter_query = {
                "$or": [
                    {"username": regex},
                    {"action": regex},
                    {"ip": regex},
                    {"target_collection": regex}
                ]
            }

        cursor = (
            db.audit_logs_collection
            .find(filter_query)
            .sort("timestamp", -1)
            .skip(skip)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    @staticmethod
    async def get_logs_by_user(user_id: ObjectId, limit: int = 100) -> list:
        cursor = (
            db.audit_logs_collection
            .find({"user_id": user_id})
            .sort("timestamp", -1)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    @staticmethod
    async def count_all(search: str = None) -> int:
        filter_query = {}
        if search:
            safe_search = re.escape(search)
            regex = {"$regex": safe_search, "$options": "i"}
            filter_query = {
                "$or": [
                    {"username": regex},
                    {"action": regex},
                    {"ip": regex},
                    {"target_collection": regex}
                ]
            }
        return await db.audit_logs_collection.count_documents(filter_query)
