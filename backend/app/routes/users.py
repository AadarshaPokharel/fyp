from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from pydantic import BaseModel, EmailStr, field_validator
from bson import ObjectId
from typing import Optional
import re

from app.core.auth import get_admin_user, get_current_user
from app.core.email import send_password_setup_email, send_pm_deleted
from app.services import UserService, AuditService

users_router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _serialize(u: dict) -> dict:
    return {
        "id": str(u["_id"]),
        "username": u.get("username", ""),
        "name": u.get("name", u.get("username", "")),
        "email": u.get("email"),
        "role": u.get("role"),
        "is_active": u.get("is_active", False),
        "created_at": u.get("created_at").isoformat() if u.get("created_at") else None,
    }


# ── List all users ─────────────────────────────────────────────────────────────

@users_router.get("/")
async def list_users(
    role: Optional[str] = None,
    current_user: dict = Depends(get_admin_user)
):
    """List all users (admin only). Filter by role with ?role=policy_maker"""
    users = await UserService.list_users(role=role)
    return [_serialize(u) for u in users]


# ── Create policy maker (invite flow) ─────────────────────────────────────────

class CreatePolicyMakerRequest(BaseModel):
    name: str
    email: EmailStr


@users_router.post("/", status_code=201)
async def create_policy_maker(
    body: CreatePolicyMakerRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_admin_user),
):
    """
    Admin creates a Policy Maker account.
    An email with a password-setup link is sent to the provided address in the background.
    """
    try:
        user_doc, plain_token = await UserService.create_policy_maker(
            name=body.name,
            email=body.email,
            created_by=current_user["_id"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Send setup email in background
    background_tasks.add_task(
        send_password_setup_email,
        to_email=body.email,
        username=user_doc["username"],
        token=plain_token,
    )

    await AuditService.log_action(
        user_id=current_user["_id"],
        username=current_user["username"],
        action="create_policy_maker",
        details={"new_user_id": str(user_doc["_id"]), "email_queued": True},
        target_collection="users",
        target_id=user_doc["_id"],
        ip=request.client.host if request.client else None,
    )

    return {
        **_serialize(user_doc),
        "message": "Policy maker created. Setup email queued for delivery.",
    }


# ── Get single user ────────────────────────────────────────────────────────────

@users_router.get("/{user_id}")
async def get_user(user_id: str, current_user: dict = Depends(get_admin_user)):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    user = await UserService.get_user_by_id(oid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _serialize(user)


# ── Update user ────────────────────────────────────────────────────────────────

class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    role: Optional[str] = None


@users_router.patch("/{user_id}")
async def update_user(
    user_id: str,
    body: UpdateUserRequest,
    request: Request,
    current_user: dict = Depends(get_admin_user),
):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    try:
        updated = await UserService.update_user(oid, body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not updated:
        raise HTTPException(status_code=404, detail="User not found")

    await AuditService.log_action(
        user_id=current_user["_id"],
        username=current_user["username"],
        action="update_user",
        details={"updated_user_id": user_id, "changes": body.model_dump(exclude_none=True)},
        target_collection="users",
        target_id=oid,
        ip=request.client.host if request.client else None,
    )

    return _serialize(updated)


# ── Delete user ────────────────────────────────────────────────────────────────

@users_router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_admin_user),
):
    if user_id == str(current_user["_id"]):
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    # Fetch user data before deleting to know if we need to email them
    user = await UserService.get_user_by_id(oid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        success = await UserService.delete_user(oid)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(exc)}")

    if not success:
        raise HTTPException(status_code=500, detail="Delete operation returned no result")

    # Send deletion notice email if the deleted user is a policy maker
    if user.get("role") == "policy_maker":
        pm_name = user.get("profile", {}).get("name") or user.get("username") or "Policy Maker"
        background_tasks.add_task(
            send_pm_deleted,
            to_email=user["email"],
            pm_name=pm_name
        )

    await AuditService.log_action(
        user_id=current_user["_id"],
        username=current_user["username"],
        action="delete_user",
        details={"deleted_user_id": user_id, "role": user.get("role")},
        target_collection="users",
        target_id=oid,
        ip=request.client.host if request.client else None,
    )

    return {"message": "User deleted successfully"}


# ── Resend setup email ─────────────────────────────────────────────────────────

@users_router.post("/{user_id}/resend-invite")
async def resend_invite(
    user_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_admin_user),
):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    user = await UserService.get_user_by_id(oid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.get("is_active"):
        raise HTTPException(status_code=400, detail="User has already set their password.")

    plain_token = await UserService.regenerate_setup_token(oid)
    
    # Send email in background
    background_tasks.add_task(
        send_password_setup_email,
        to_email=user["email"],
        username=user["username"],
        token=plain_token,
    )

    return {"message": "Invite resent (queued for delivery)."}


# ── Bulk resend invites (admin only) ──────────────────────────────────────────

@users_router.post("/admin/resend-all-invites")
async def resend_all_invites(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_admin_user),
):
    """
    Finds all policy makers who have NOT yet activated their accounts,
    regenerates their tokens, and resends the induction emails in the background.
    """
    inactive_users = await UserService.get_inactive_policy_makers(limit=500)
    
    if not inactive_users:
        return {"message": "No inactive policy makers found to re-invite.", "count": 0}

    count = 0
    for user in inactive_users:
        oid = user["_id"]
        plain_token = await UserService.regenerate_setup_token(oid)
        
        # Queue email
        background_tasks.add_task(
            send_password_setup_email,
            to_email=user["email"],
            username=user["username"],
            token=plain_token,
        )
        count += 1

    await AuditService.log_action(
        user_id=current_user["_id"],
        username=current_user["username"],
        action="bulk_resend_invites",
        details={"count": count, "target_role": "policy_maker"},
        target_collection="users",
        ip=request.client.host if request.client else None,
    )

    return {
        "message": f"Bulk re-invitation successful. {count} emails queued for delivery.",
        "count": count
    }


# ── Admin — get all audit logs ─────────────────────────────────────────────────

@users_router.get("/admin/audit-logs")
async def get_all_audit_logs(
    limit: int = 100,
    skip: int = 0,
    search: Optional[str] = None,
    current_user: dict = Depends(get_admin_user),
):
    logs = await AuditService.get_all_logs(limit=limit, skip=skip, search=search)
    total = await AuditService.count_all(search=search)

    def _ser_log(log):
        return {
            "id": str(log["_id"]),
            "user_id": str(log.get("user_id", "")),
            "username": log.get("username", ""),
            "action": log.get("action", ""),
            "details": log.get("details", {}),
            "ip": log.get("ip"),
            "target_collection": log.get("target_collection"),
            "target_id": str(log["target_id"]) if log.get("target_id") else None,
            "timestamp": log.get("timestamp").isoformat() if log.get("timestamp") else None,
        }

    return {"total": total, "logs": [_ser_log(l) for l in logs]}
