# backend/app/services/role_service.py
import app.db as db

class RoleService:
    @staticmethod
    async def get_all_roles() -> list:
        cursor = db.roles_collection.find()
        return await cursor.to_list(length=100)

    @staticmethod
    async def get_role_by_name(name: str) -> dict:
        return await db.roles_collection.find_one({"name": name})

    @staticmethod
    async def create_role(name: str, description: str = "") -> dict:
        doc = {"name": name, "description": description}
        result = await db.roles_collection.insert_one(doc)
        return await db.roles_collection.find_one({"_id": result.inserted_id})
