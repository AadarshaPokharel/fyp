# backend/app/services/user_service.py
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from bson import ObjectId
import app.db as db
from app.core.auth import get_password_hash
from app.core.config import SETUP_TOKEN_EXPIRE_HOURS
from app.models import UserCreate


class UserService:

    # ── Basic lookups ──────────────────────────────────────────────────────────

    @staticmethod
    async def get_user_by_username(username: str) -> dict:
        return await db.users_collection.find_one({"username": username})

    @staticmethod
    async def get_user_by_identifier(identifier: str) -> dict:
        """
        Looks up a user by either email or username.
        Used for flexible login.
        """
        if "@" in identifier:
            user = await db.users_collection.find_one({"email": identifier.lower()})
            if user:
                return user
        
        # Fallback to username lookup
        return await db.users_collection.find_one({"username": identifier})

    @staticmethod
    async def get_user_by_email(email: str) -> dict:
        return await db.users_collection.find_one({"email": email})

    @staticmethod
    async def get_user_by_id(user_id: ObjectId) -> dict:
        return await db.users_collection.find_one({"_id": user_id})

    @staticmethod
    async def get_inactive_policy_makers(limit: int = 500) -> list:
        """
        Retrieves all policy makers that have not yet activated their account.
        """
        query = {"role": "policy_maker", "is_active": False}
        cursor = db.users_collection.find(query)
        return await cursor.to_list(length=limit)

    @staticmethod
    async def list_users(role: str = None, limit: int = 200) -> list:
        query = {}
        if role:
            query["role"] = role
        cursor = db.users_collection.find(query, {"hashed_password": 0, "setup_token_hash": 0})
        return await cursor.to_list(length=limit)

    # ── Create (old — used by /auth/register, requires plain password) ─────────

    @staticmethod
    async def create_user(user: UserCreate, created_by: ObjectId = None) -> dict:
        user_doc = {
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "profile": {
                "name": user.profile.name,
                "bio": user.profile.bio,
                "profile_picture": user.profile.profile_picture
            },
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "hashed_password": get_password_hash(user.password),
            "created_by": created_by,
        }
        result = await db.users_collection.insert_one(user_doc)
        return await db.users_collection.find_one({"_id": result.inserted_id})

    # ── Create Policy Maker via email invite flow ──────────────────────────────

    @staticmethod
    async def create_policy_maker(name: str, email: str, created_by: ObjectId) -> tuple[dict, str]:
        """
        Creates a policy maker account that is INACTIVE until they set their password.
        Returns (user_doc, plain_token) — plain_token is emailed; only its hash is stored.
        """
        # Check uniqueness by email
        if await db.users_collection.find_one({"email": email}):
            raise ValueError("A user with this email already exists.")

        # Derive a unique username from email prefix
        base = email.split("@")[0].lower().replace(".", "_")
        username = base
        counter = 1
        while await db.users_collection.find_one({"username": username}):
            username = f"{base}{counter}"
            counter += 1

        plain_token = secrets.token_urlsafe(48)
        token_hash = hashlib.sha256(plain_token.encode()).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=SETUP_TOKEN_EXPIRE_HOURS)

        user_doc = {
            "username": username,
            "email": email,
            "role": "policy_maker",
            "profile": {
                "name": name,
                "bio": None,
                "profile_picture": None
            },
            "is_active": False,          # activated after password set
            "created_at": datetime.now(timezone.utc),
            "hashed_password": "",       # set later
            "created_by": created_by,
            "setup_token_hash": token_hash,
            "setup_token_expires": expires_at,
        }
        result = await db.users_collection.insert_one(user_doc)
        doc = await db.users_collection.find_one({"_id": result.inserted_id})
        return doc, plain_token

    # ── Set password via token ─────────────────────────────────────────────────

    @staticmethod
    async def set_password_via_token(plain_token: str, new_password: str) -> dict:
        """
        Validates the token, sets the password, and activates the account if it was inactive.
        Works for both initial setup and password resets.
        Returns the updated user doc on success, raises ValueError on failure.
        """
        token_hash = hashlib.sha256(plain_token.encode()).hexdigest()
        user = await db.users_collection.find_one({
            "$or": [
                {"setup_token_hash": token_hash},
                {"reset_token_hash": token_hash}
            ]
        })

        if not user:
            raise ValueError("Invalid or already-used token.")

        # Determine WHICH token matched, then check THAT expiry
        if user.get("reset_token_hash") == token_hash:
            expires = user.get("reset_token_expires")
            token_field = "reset_token_hash"
            expires_field = "reset_token_expires"
        else:
            expires = user.get("setup_token_expires")
            token_field = "setup_token_hash"
            expires_field = "setup_token_expires"

        if not expires:
            raise ValueError("Token has expired.")

        now = datetime.now(timezone.utc)
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)

        if now > expires:
            raise ValueError("Token has expired.")

        update_fields = {
            "hashed_password": get_password_hash(new_password),
            "is_active": True,
        }

        await db.users_collection.update_one(
            {"_id": user["_id"]},
            {
                "$set": update_fields,
                "$unset": {token_field: "", expires_field: ""},
            },
        )
        return await db.users_collection.find_one({"_id": user["_id"]})

    # ── Update ─────────────────────────────────────────────────────────────────

    @staticmethod
    async def update_user(user_id: ObjectId, data: dict, is_admin: bool = False) -> dict:
        """
        Updates a user. If not admin, only allows certain fields.
        Handles nested profile updates.
        """
        if is_admin:
            allowed = {
                "email", "is_active", "role", "password",
                "name", "bio", "profile_picture",
                "phone", "department", "job_title", "location"
            }
        else:
            allowed = {
                "email", "password",
                "name", "bio", "profile_picture",
                "phone", "department", "job_title", "location"
            }

        update = {}
        for k, v in data.items():
            if k in allowed and v is not None:
                if k == "password":
                    update["hashed_password"] = get_password_hash(v)
                elif k in {"name", "bio", "profile_picture", "phone", "department", "job_title", "location"}:
                    update[f"profile.{k}"] = v
                else:
                    update[k] = v

        if not update:
            raise ValueError("No valid fields to update.")

        await db.users_collection.update_one({"_id": user_id}, {"$set": update})
        return await db.users_collection.find_one({"_id": user_id}, {"hashed_password": 0, "token_hash": 0})

    # ── Delete ─────────────────────────────────────────────────────────────────

    @staticmethod
    async def delete_user(user_id: ObjectId) -> bool:
        user = await db.users_collection.find_one({"_id": user_id})
        if not user:
            raise ValueError("User not found")
            
        # Clean up Cloudinary avatar
        from app.services.storage_service import storage_service
        await storage_service.delete_avatar(str(user_id))

        if user.get("role") == "policy_maker":
            # 1. Clean up PM Verification Request & Uploaded Credentials
            pm_req = await db.pm_verification_requests_collection.find_one({"email": user["email"]})
            if pm_req:
                creds = pm_req.get("credentials", {})
                docs = creds.get("documents", {})
                if docs:
                    for field in ["citizenship_pdf", "traffic_id", "education_certificate", "health_certificate", "training_certificate"]:
                        public_id = docs.get(field)
                        if public_id:
                            await storage_service.delete_resource(public_id, resource_type="image")
                await db.pm_verification_requests_collection.delete_one({"_id": pm_req["_id"]})

            # 2. Clean up Download Requests & CSV files
            cursor = db.download_requests_collection.find({"user_id": user_id})
            async for req in cursor:
                file_key = req.get("file_key")
                if file_key:
                    await storage_service.delete_csv(file_key)
            await db.download_requests_collection.delete_many({"user_id": user_id})

            # 3. Clean up Policies & final submission files
            cursor = db.policies_collection.find({"$or": [{"owner_id": str(user_id)}, {"owner_id": user_id}]})
            async for policy in cursor:
                file_id = policy.get("final_submission_file_id")
                if file_id:
                    await storage_service.delete_resource(file_id, resource_type="raw")
            await db.policies_collection.delete_many({"$or": [{"owner_id": str(user_id)}, {"owner_id": user_id}]})

        # Delete user from MongoDB
        result = await db.users_collection.delete_one({"_id": user_id})
        return result.deleted_count > 0

    # ── Resend setup email (regenerate token) ──────────────────────────────────

    @staticmethod
    async def regenerate_setup_token(user_id: ObjectId) -> str:
        plain_token = secrets.token_urlsafe(48)
        token_hash = hashlib.sha256(plain_token.encode()).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=SETUP_TOKEN_EXPIRE_HOURS)
        await db.users_collection.update_one(
            {"_id": user_id},
            {"$set": {"setup_token_hash": token_hash, "setup_token_expires": expires_at}},
        )
        return plain_token

    @staticmethod
    async def generate_reset_token(user_id: ObjectId) -> str:
        """
        Generates a reset token for forgot password flow.
        Expires in 2 hours.
        """
        plain_token = secrets.token_urlsafe(48)
        token_hash = hashlib.sha256(plain_token.encode()).hexdigest()
        # Reset tokens are more short-lived for security
        expires_at = datetime.now(timezone.utc) + timedelta(hours=2)
        
        await db.users_collection.update_one(
            {"_id": user_id},
            {"$set": {"reset_token_hash": token_hash, "reset_token_expires": expires_at}},
        )
        return plain_token
