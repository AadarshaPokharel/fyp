# backend/app/services/policy_service.py
from typing import List, Optional, Dict
from bson import ObjectId
from datetime import datetime
import logging

from app.db import connection as db
from app.models.policy import PolicyState, PolicyCreate, PolicyUpdate, PolicyInDB
from app.services.audit_service import AuditService
from app.services.storage_service import storage_service
from app.core import email

logger = logging.getLogger(__name__)

class PolicyService:

    async def _log_action(self, user_id_str: str, action: str, details: dict):
        user = await db.users_collection.find_one({"_id": ObjectId(user_id_str)})
        username = user.get("username", "Unknown") if user else "Unknown"
        await AuditService.log_action(
            user_id=ObjectId(user_id_str),
            username=username,
            action=action,
            details=details,
            target_collection="policies"
        )
    
    async def get_user_policies(self, user_id: str) -> List[Dict]:
        cursor = db.policies_collection.find({"owner_id": user_id}).sort("updated_at", -1)
        return await cursor.to_list(length=100)

    async def get_all_policies(self) -> List[Dict]:
        cursor = db.policies_collection.find().sort("updated_at", -1)
        return await cursor.to_list(length=100)

    async def get_policies_for_pm(self, user_id: str) -> List[Dict]:
        """PMs see their own policies AND any approved/completed ones globally."""
        cursor = db.policies_collection.find({
            "$or": [
                {"owner_id": user_id},
                {"status": {"$in": [PolicyState.APPROVED.value, PolicyState.COMPLETED.value]}}
            ]
        }).sort("updated_at", -1)
        return await cursor.to_list(length=100)
        
    async def get_policy(self, policy_id: str) -> Optional[Dict]:
        if not ObjectId.is_valid(policy_id):
            return None
        return await db.policies_collection.find_one({"_id": ObjectId(policy_id)})

    async def create_or_update_draft(self, user_id: str, policy_data: PolicyCreate, policy_id: Optional[str] = None) -> str:
        """Create a new draft or update an existing draft/revised policy."""
        data_dict = policy_data.model_dump(exclude_unset=True)
        data_dict["updated_at"] = datetime.utcnow()

        if policy_id:
            if not ObjectId.is_valid(policy_id):
                raise ValueError("Invalid policy ID")
            
            existing = await self.get_policy(policy_id)
            if not existing:
                raise ValueError("Policy not found")
            
            # Admins can edit any policy; PMs can only edit their own
            if existing["owner_id"] != user_id:
                user = await db.users_collection.find_one({"_id": ObjectId(user_id)})
                if not user or user.get("role") != "admin":
                    raise ValueError("Not authorized to edit this policy")
                
            if existing["status"] not in [PolicyState.DRAFT, PolicyState.REJECTED, PolicyState.REVISED]:
                raise ValueError(f"Cannot edit policy in state: {existing['status']}")
            
            # If it was rejected and they edit it, state transitions to REVISED
            if existing["status"] == PolicyState.REJECTED:
                data_dict["status"] = PolicyState.REVISED
                
            await db.policies_collection.update_one(
                {"_id": ObjectId(policy_id)},
                {"$set": data_dict}
            )
            return policy_id
        else:
            new_policy = PolicyInDB(owner_id=user_id, **data_dict)
            dumped_policy = new_policy.model_dump(by_alias=True, exclude_none=True)
            # Explicitly remove _id if it's null to avoid DuplicateKeyError in MongoDB
            if "_id" in dumped_policy and not dumped_policy["_id"]:
                del dumped_policy["_id"]
                
            result = await db.policies_collection.insert_one(dumped_policy)
            await self._log_action(user_id, "policy_draft_created", {"policy_id": str(result.inserted_id)})
            return str(result.inserted_id)

    async def submit_policy(self, user_id: str, policy_id: str) -> None:
        """Submit a policy for review."""
        if not ObjectId.is_valid(policy_id):
            raise ValueError("Invalid policy ID")
            
        policy = await self.get_policy(policy_id)
        if not policy:
            raise ValueError("Policy not found")
            
        if policy["owner_id"] != user_id:
            # Allow admins to submit any policy
            user = await db.users_collection.find_one({"_id": ObjectId(user_id)})
            if not user or user.get("role") != "admin":
                raise ValueError("Not authorized to submit this policy")
            
        if policy["status"] not in [PolicyState.DRAFT, PolicyState.REVISED]:
            raise ValueError(f"Cannot submit policy from state: {policy['status']}")
            
        user = await db.users_collection.find_one({"_id": ObjectId(user_id)})
        is_admin = user and user.get("role") == "admin"
        
        target_status = PolicyState.COMPLETED if is_admin else PolicyState.SUBMITTED
        
        await db.policies_collection.update_one(
            {"_id": ObjectId(policy_id)},
            {"$set": {
                "status": target_status,
                "is_locked": True,
                "updated_at": datetime.utcnow()
            }}
        )
        await self._log_action(user_id, "policy_submitted", {"policy_id": policy_id, "final_status": target_status})
        
        # Send Email (only for policy makers, since admins don't need to review their own submissions)
        if user and not is_admin:
            await email.send_policy_submitted(user["email"], user.get("username", "Policy Maker"), policy.get("title", "Untitled Policy"))

    async def _get_policy_owner_info(self, owner_id: str) -> tuple[Optional[str], str]:
        user = await db.users_collection.find_one({"_id": ObjectId(owner_id)})
        if user:
            return user["email"], user.get("username", "Policy Maker")
        return None, "Policy Maker"

    async def set_under_review(self, admin_id: str, policy_id: str) -> None:
        if not ObjectId.is_valid(policy_id):
            return
        
        policy = await self.get_policy(policy_id)
        if policy and policy["status"] == PolicyState.SUBMITTED:
            await db.policies_collection.update_one(
                {"_id": ObjectId(policy_id)},
                {"$set": {
                    "status": PolicyState.UNDER_REVIEW,
                    "updated_at": datetime.utcnow()
                }}
            )

    async def review_policy(self, admin_id: str, policy_id: str, action: str, feedback: str = None) -> None:
        if not ObjectId.is_valid(policy_id):
            raise ValueError("Invalid policy ID")
            
        policy = await self.get_policy(policy_id)
        if not policy:
            raise ValueError("Policy not found")
            
        if policy["status"] not in [PolicyState.SUBMITTED, PolicyState.UNDER_REVIEW]:
            raise ValueError(f"Cannot review policy in state: {policy['status']}")

        owner_email, pm_name = await self._get_policy_owner_info(policy["owner_id"])
        title = policy.get("title", "Untitled Policy")

        if action == "approve":
            await db.policies_collection.update_one(
                {"_id": ObjectId(policy_id)},
                {"$set": {
                    "status": PolicyState.APPROVED,
                    "is_locked": True,
                    "admin_feedback": feedback,
                    "updated_at": datetime.utcnow()
                }}
            )
            # Instantly wait for final submission
            await db.policies_collection.update_one(
                {"_id": ObjectId(policy_id)},
                {"$set": {
                    "status": PolicyState.AWAITING_FINAL_SUBMISSION,
                    "updated_at": datetime.utcnow()
                }}
            )
            await self._log_action(admin_id, "policy_approved", {"policy_id": policy_id})
            if owner_email:
                await email.send_policy_approval(owner_email, pm_name, title)

        elif action == "reject":
            revision_count = policy.get("revision_count", 0) + 1
            max_revisions = 2
            
            # If they have hit the revision limit
            if revision_count > max_revisions:
                raise ValueError("Maximum revisions reached. Admin must either grant an extension or close the policy.")

            await db.policies_collection.update_one(
                {"_id": ObjectId(policy_id)},
                {"$set": {
                    "status": PolicyState.REJECTED,
                    "is_locked": False,
                    "admin_feedback": feedback,
                    "revision_count": revision_count,
                    "updated_at": datetime.utcnow()
                }}
            )
            await self._log_action(admin_id, "policy_rejected", {"policy_id": policy_id})
            if owner_email:
                revisions_left = max_revisions - revision_count
                await email.send_policy_rejection(owner_email, pm_name, title, feedback, revisions_left)

        elif action == "close":
            await db.policies_collection.update_one(
                {"_id": ObjectId(policy_id)},
                {"$set": {
                    "status": PolicyState.CLOSED,
                    "is_locked": True,
                    "admin_feedback": feedback,
                    "updated_at": datetime.utcnow()
                }}
            )
            
            # Clean up local files
            file_id = policy.get("final_submission_file_id")
            if file_id:
                try:
                    import os
                    UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "policies")
                    file_path = os.path.join(UPLOAD_DIR, file_id)
                    if os.path.exists(file_path):
                        os.remove(file_path)
                except Exception as e:
                    logger.error(f"Failed to delete local file for closed policy {policy_id}: {e}")

            await self._log_action(admin_id, "policy_closed", {"policy_id": policy_id})
            if owner_email:
                await email.send_policy_closed(owner_email, pm_name, title)

        elif action == "extend":
            # Just decrement revision count by 1 to grant an extension, and set to rejected
            revision_count = policy.get("revision_count", 0)
            if revision_count > 0:
                await db.policies_collection.update_one(
                    {"_id": ObjectId(policy_id)},
                    {"$set": {
                        "revision_count": revision_count - 1,
                        "status": PolicyState.REJECTED,
                        "is_locked": False,
                        "admin_feedback": feedback,
                        "updated_at": datetime.utcnow()
                    }}
                )
                await self._log_action(admin_id, "policy_extension_granted", {"policy_id": policy_id})
                if owner_email:
                    await email.send_policy_extension(owner_email, pm_name, title)
        else:
            raise ValueError("Invalid action")

    async def submit_final_documents(self, user_id: str, policy_id: str, file_bytes: bytes, filename: str) -> None:
        if not ObjectId.is_valid(policy_id):
            raise ValueError("Invalid policy ID")
            
        policy = await self.get_policy(policy_id)
        if not policy:
            raise ValueError("Policy not found")
            
        if policy["owner_id"] != user_id:
            raise ValueError("Not authorized")
            
        if policy["status"] != PolicyState.AWAITING_FINAL_SUBMISSION:
            raise ValueError(f"Policy is not awaiting final submission (Status: {policy['status']})")

        # Upload as raw private file locally
        ext = filename.split(".")[-1] if "." in filename else "bin"
        file_id = f"policy_final_{policy_id}_{int(datetime.utcnow().timestamp())}.{ext}"
        
        try:
            import os
            UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "policies")
            os.makedirs(UPLOAD_DIR, exist_ok=True)
            file_path = os.path.join(UPLOAD_DIR, file_id)
            with open(file_path, "wb") as f:
                f.write(file_bytes)
        except Exception as e:
            logger.error(f"Local upload failed for policy {policy_id}: {e}")
            raise ValueError("Failed to upload final submission document")

        await db.policies_collection.update_one(
            {"_id": ObjectId(policy_id)},
            {"$set": {
                "final_submission_file_id": file_id,
                "status": PolicyState.COMPLETED,
                "updated_at": datetime.utcnow()
            }}
        )
        await self._log_action(user_id, "policy_final_submission", {"policy_id": policy_id})

        owner_email, pm_name = await self._get_policy_owner_info(policy["owner_id"])
        if owner_email:
            await email.send_final_submission_received(owner_email, pm_name, policy.get("title", "Untitled Policy"))

    async def delete_policy(self, admin_id: str, policy_id: str) -> None:
        """Permanently delete a policy (admin-only). Cleans up local files."""
        if not ObjectId.is_valid(policy_id):
            raise ValueError("Invalid policy ID")

        policy = await self.get_policy(policy_id)
        if not policy:
            raise ValueError("Policy not found")

        # Clean up local files
        for file_field in ("final_submission_file_id", "supporting_documents_file_id"):
            file_id = policy.get(file_field)
            if file_id:
                try:
                    import os
                    UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "policies")
                    file_path = os.path.join(UPLOAD_DIR, file_id)
                    if os.path.exists(file_path):
                        os.remove(file_path)
                except Exception as e:
                    logger.warning(f"Failed to delete local file ({file_field}) for policy {policy_id}: {e}")

        await db.policies_collection.delete_one({"_id": ObjectId(policy_id)})
        await self._log_action(admin_id, "policy_deleted", {
            "policy_id": policy_id,
            "title": policy.get("title", "Untitled"),
        })

policy_service = PolicyService()
