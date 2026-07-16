# backend/app/services/verification_service.py
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from typing import List, Optional
import app.db as db
from app.models.verification import (
    VerificationStatus, PMVerificationRequest, PMCredentials,
    PersonalDetails, FamilyDetails, AddressDetails, DocumentUploads
)
from app.core.email import (
    send_pm_initial_approval, send_pm_rejection, send_pm_reminder,
    send_pm_auto_resend, send_pm_auto_rejection, send_pm_credential_rejection,
    send_pm_eligibility_approval
)
import os
from app.services.storage_service import storage_service
from app.core.config import FRONTEND_URL

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "credentials")

class VerificationService:

    @staticmethod
    async def create_request(email: str, password: str) -> dict:
        """Stage 1: PM self-registers."""
        # Check if already exists in verification requests
        existing = await db.pm_verification_requests_collection.find_one({"email": email.lower()})
        if existing:
            # Check if an active user account actually exists for this email
            user_exists = await db.users_collection.find_one({"email": email.lower()})
            
            # Reapply is allowed if:
            # 1. The status is one of the rejected/failed statuses
            # 2. Or, no active user account exists in the system (e.g., deleted user, orphaned request)
            reapply_allowed_statuses = [
                VerificationStatus.REJECTED_INITIAL,
                VerificationStatus.AUTO_REJECTED,
                VerificationStatus.REJECTED_CREDENTIALS,
            ]
            
            if existing["status"] in reapply_allowed_statuses or not user_exists:
                # Clean up any leftover Cloudinary files in the request
                creds = existing.get("credentials", {}) or {}
                docs = creds.get("documents", {}) or {}
                if docs:
                    for field in ["citizenship_pdf", "traffic_id", "education_certificate", "health_certificate", "training_certificate"]:
                        public_id = docs.get(field)
                        if public_id:
                            file_path = os.path.join(UPLOAD_DIR, public_id)
                            if os.path.exists(file_path):
                                os.remove(file_path)
                
                await db.pm_verification_requests_collection.delete_one({"_id": existing["_id"]})
            else:
                raise ValueError("A registration request for this email is already in progress.")

        # Check if already a user
        if await db.users_collection.find_one({"email": email.lower()}):
            raise ValueError("A user with this email already exists.")

        from app.core.auth import get_password_hash
        request_doc = {
            "email": email.lower(),
            "status": VerificationStatus.PENDING_INITIAL,
            "temp_password_hash": get_password_hash(password),
            "resend_count": 0,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "credentials": {
                "is_draft": True,
                "personal": None,
                "family": None,
                "address": None,
                "documents": None
            }
        }
        result = await db.pm_verification_requests_collection.insert_one(request_doc)
        return await db.pm_verification_requests_collection.find_one({"_id": result.inserted_id})

    @staticmethod
    async def approve_initial(request_id: ObjectId) -> bool:
        """Stage 1 Admin Approval: Send credential upload link."""
        req = await db.pm_verification_requests_collection.find_one({"_id": request_id})
        if not req or req["status"] != VerificationStatus.PENDING_INITIAL:
            return False

        token = secrets.token_urlsafe(64)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=48)

        await db.pm_verification_requests_collection.update_one(
            {"_id": request_id},
            {
                "$set": {
                    "status": VerificationStatus.APPROVED_INITIAL,
                    "token": token,
                    "token_expires_at": expires_at,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )

        link = f"{FRONTEND_URL}/verify-credentials?token={token}"
        await send_pm_initial_approval(req["email"], link)
        return True

    @staticmethod
    async def reject_initial(request_id: ObjectId, reason: str) -> bool:
        """Stage 1 Admin Rejection."""
        req = await db.pm_verification_requests_collection.find_one({"_id": request_id})
        if not req or req["status"] != VerificationStatus.PENDING_INITIAL:
            return False

        await db.pm_verification_requests_collection.update_one(
            {"_id": request_id},
            {
                "$set": {
                    "status": VerificationStatus.REJECTED_INITIAL,
                    "rejection_reason": reason,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        await send_pm_rejection(req["email"], reason)
        return True

    @staticmethod
    async def get_request_by_token(token: str) -> Optional[dict]:
        return await db.pm_verification_requests_collection.find_one({"token": token})

    @staticmethod
    async def save_credentials(token: str, data: dict, is_final: bool = False) -> bool:
        """Stage 2: PM uploads credentials (draft or final)."""
        req = await db.pm_verification_requests_collection.find_one({"token": token})
        if not req:
            return False

        # Verify expiry
        if req["token_expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            return False

        update_data = {
            "credentials.personal": data.get("personal"),
            "credentials.family": data.get("family"),
            "credentials.address": data.get("address"),
            "credentials.documents": data.get("documents"),
            "credentials.is_draft": not is_final,
            "updated_at": datetime.now(timezone.utc)
        }

        if is_final:
            update_data["status"] = VerificationStatus.CREDENTIALS_SUBMITTED
            # We don't unset the token yet, as admin might reject and we might need to re-open?
            # Actually, per requirements, rejection deletes everything.
        
        await db.pm_verification_requests_collection.update_one(
            {"_id": req["_id"]},
            {"$set": update_data}
        )
        return True

    @staticmethod
    async def approve_credentials(request_id: ObjectId) -> bool:
        """Stage 3 Admin Approval: Move to Stage 4 (Login Setup)."""
        req = await db.pm_verification_requests_collection.find_one({"_id": request_id})
        if not req or req["status"] != VerificationStatus.CREDENTIALS_SUBMITTED:
            return False

        setup_token = secrets.token_urlsafe(64)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

        await db.pm_verification_requests_collection.update_one(
            {"_id": request_id},
            {
                "$set": {
                    "status": VerificationStatus.APPROVED_CREDENTIALS,
                    "setup_token": setup_token,
                    "setup_token_expires_at": expires_at,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )

        link = f"{FRONTEND_URL}/setup-password?token={setup_token}"
        await send_pm_eligibility_approval(req["email"], link)
        return True

    @staticmethod
    async def reject_credentials(request_id: ObjectId, reason: str) -> bool:
        """Stage 3 Admin Rejection: Delete everything."""
        req = await db.pm_verification_requests_collection.find_one({"_id": request_id})
        if not req:
            return False

        # Wipe Cloudinary files
        creds = req.get("credentials", {})
        docs = creds.get("documents", {})
        if docs:
            for field in ["citizenship_pdf", "traffic_id", "education_certificate", "health_certificate", "training_certificate"]:
                public_id = docs.get(field)
                if public_id:
                    file_path = os.path.join(UPLOAD_DIR, public_id)
                    if os.path.exists(file_path):
                        os.remove(file_path)

        await db.pm_verification_requests_collection.update_one(
            {"_id": request_id},
            {
                "$set": {
                    "status": VerificationStatus.REJECTED_CREDENTIALS,
                    "rejection_reason": reason,
                    "updated_at": datetime.now(timezone.utc)
                },
                "$unset": {
                    "credentials": "" # Clear credentials data
                }
            }
        )
        await send_pm_credential_rejection(req["email"], reason)
        return True

    @staticmethod
    async def complete_setup(setup_token: str, password: str) -> bool:
        """Stage 4: Password setup and account activation."""
        req = await db.pm_verification_requests_collection.find_one({"setup_token": setup_token})
        if not req or req["status"] != VerificationStatus.APPROVED_CREDENTIALS:
            return False

        if req["setup_token_expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            return False

        # Create the actual User
        from app.services.user_service import UserService
        from app.models.user import UserCreate, UserProfile
        
        # Derive name and fields from credentials if available
        creds = req.get("credentials") or {}
        personal_info = creds.get("personal") or {}
        name = personal_info.get("full_name", "Policy Maker")
        phone = personal_info.get("phone_number")
        address_info = creds.get("address") or {}
        location = address_info.get("current_posting_address")
        
        # We need to satisfy UserCreate
        # UserService.create_policy_maker is tailored for admin invite, but we can reuse its logic
        # Actually, let's just create it manually or add a new method to UserService.
        
        # For now, let's use create_policy_maker logic
        # base = email.split("@")[0].lower().replace(".", "_")
        # etc.
        
        # We'll call a custom method in UserService
        from app.core.auth import get_password_hash
        
        # Derive username
        email = req["email"]
        base = email.split("@")[0].lower().replace(".", "_")
        username = base
        counter = 1
        while await db.users_collection.find_one({"username": username}):
            username = f"{base}{counter}"
            counter += 1

        user_doc = {
            "username": username,
            "email": email,
            "role": "policy_maker",
            "profile": {
                "name": name,
                "bio": None,
                "profile_picture": None,
                "phone": phone,
                "department": "Policy Department",
                "job_title": "Policy Maker",
                "location": location,
                "personal": creds.get("personal"),
                "family": creds.get("family"),
                "address": creds.get("address"),
                "documents": creds.get("documents")
            },
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "hashed_password": get_password_hash(password),
        }
        await db.users_collection.insert_one(user_doc)
        
        # Mark verification as completed
        await db.pm_verification_requests_collection.update_one(
            {"_id": req["_id"]},
            {
                "$set": {
                    "status": VerificationStatus.COMPLETED,
                    "updated_at": datetime.now(timezone.utc)
                },
                "$unset": {
                    "setup_token": "",
                    "setup_token_expires_at": "",
                    "temp_password_hash": ""
                }
            }
        )
        
        from app.core.email import send_pm_setup_confirmation
        await send_pm_setup_confirmation(email)
        return True

    @staticmethod
    async def run_maintenance_tasks():
        """Periodic task for reminders and expiry handling."""
        now = datetime.now(timezone.utc)
        
        # 1. 24-hour Reminders
        reminder_24 = now + timedelta(hours=24)
        # Find approved_initial requests where token expires in approx 24 hours and haven't been reminded
        # We might need a flag 'reminded_24' to avoid double sends
        cursor = db.pm_verification_requests_collection.find({
            "status": VerificationStatus.APPROVED_INITIAL,
            "token_expires_at": {"$lte": reminder_24, "$gt": now + timedelta(hours=23)},
            "reminded_24": {"$ne": True}
        })
        async for req in cursor:
            link = f"{FRONTEND_URL}/verify-credentials?token={req['token']}"
            if await send_pm_reminder(req["email"], link, 24):
                await db.pm_verification_requests_collection.update_one({"_id": req["_id"]}, {"$set": {"reminded_24": True}})

        # 2. 6-hour Reminders
        reminder_6 = now + timedelta(hours=6)
        cursor = db.pm_verification_requests_collection.find({
            "status": VerificationStatus.APPROVED_INITIAL,
            "token_expires_at": {"$lte": reminder_6, "$gt": now + timedelta(hours=5)},
            "reminded_6": {"$ne": True}
        })
        async for req in cursor:
            link = f"{FRONTEND_URL}/verify-credentials?token={req['token']}"
            if await send_pm_reminder(req["email"], link, 6):
                await db.pm_verification_requests_collection.update_one({"_id": req["_id"]}, {"$set": {"reminded_6": True}})

        # 3. Handle Expiries (Auto-resend or Auto-reject)
        cursor = db.pm_verification_requests_collection.find({
            "status": VerificationStatus.APPROVED_INITIAL,
            "token_expires_at": {"$lt": now}
        })
        async for req in cursor:
            if req["resend_count"] < 2:
                # Auto-resend
                new_token = secrets.token_urlsafe(64)
                new_expiry = now + timedelta(hours=48)
                new_count = req["resend_count"] + 1
                
                await db.pm_verification_requests_collection.update_one(
                    {"_id": req["_id"]},
                    {
                        "$set": {
                            "token": new_token,
                            "token_expires_at": new_expiry,
                            "resend_count": new_count,
                            "reminded_24": False,
                            "reminded_6": False,
                            "updated_at": now
                        }
                    }
                )
                link = f"{FRONTEND_URL}/verify-credentials?token={new_token}"
                await send_pm_auto_resend(req["email"], link, new_count + 1) # +1 for human readable attempt count (1st re-send is 2nd attempt)
            else:
                # Auto-reject after 3rd expiry (0 initial + 2 resends = 3 chances)
                await VerificationService.auto_reject(req)

    @staticmethod
    async def auto_reject(req: dict):
        """Handle auto-rejection and cleanup."""
        # Wipe Cloudinary
        creds = req.get("credentials", {})
        docs = creds.get("documents", {})
        if docs:
            for field in ["citizenship_pdf", "traffic_id", "education_certificate", "health_certificate", "training_certificate"]:
                public_id = docs.get(field)
                if public_id:
                    file_path = os.path.join(UPLOAD_DIR, public_id)
                    if os.path.exists(file_path):
                        os.remove(file_path)
        
        await db.pm_verification_requests_collection.update_one(
            {"_id": req["_id"]},
            {
                "$set": {
                    "status": VerificationStatus.AUTO_REJECTED,
                    "updated_at": datetime.now(timezone.utc)
                },
                "$unset": {
                    "token": "",
                    "token_expires_at": "",
                    "credentials": ""
                }
            }
        )
        await send_pm_auto_rejection(req["email"])
        
        # Silent log for admin (can be an audit log entry)
        from app.services.audit_service import AuditService
        await AuditService.log_action(
            user_id=None,
            username="SYSTEM",
            action="auto_reject_pm_request",
            details={"email": req["email"], "reason": "Max link expiries reached"},
            target_collection="pm_verification_requests",
            target_id=req["_id"]
        )
