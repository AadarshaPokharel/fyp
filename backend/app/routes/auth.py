# backend/app/routes/auth.py
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field, EmailStr
from typing import Optional

import app.db as db
from app.core.auth import (
    verify_password, create_access_token, get_current_user, get_admin_user, verify_token, oauth2_scheme
)
from app.core.email import send_password_reset_email
from app.models import UserCreate, UserInDB
from app.services import UserService, AuditService
from app.core.limiter import limiter

auth_router = APIRouter()


# ── Login ──────────────────────────────────────────────────────────────────────

@auth_router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    """Login with email/username and password, returns JWT."""
    user = await UserService.get_user_by_identifier(form_data.username)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user.get("is_active", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not active. Check your email to set your password.",
        )

    if not verify_password(form_data.password, user.get("hashed_password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    access_token = create_access_token(
        data={"sub": user["username"], "role": user["role"]}
    )

    # Record login timestamp (indexed via idx_last_login sparse index)
    await db.users_collection.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login_at": datetime.now(timezone.utc)}},
    )

    await AuditService.log_action(
        user_id=user["_id"],
        username=user["username"],
        action="login",
        ip=request.client.host if request.client else None,
    )


    # ── Build profile payload ──────────────────────────────────────────────────
    if user.get("role") == "policy_maker":
        profile = await _build_pm_profile(user)
    else:
        profile = user.get("profile") or {}

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user["role"],
        "username": user["username"],
        "user_id": str(user["_id"]),
        "email": user.get("email"),
        "is_active": user.get("is_active", True),
        "profile": profile
    }


# ── Logout (audit only — client discards token) ────────────────────────────────

# ── Policy Maker credential profile builder ────────────────────────────────────

async def _build_pm_profile(user: dict) -> dict:
    """Always fetch verified credentials from pm_verification_requests for policy makers."""
    req = await db.pm_verification_requests_collection.find_one({"email": user.get("email")})
    if not req or "credentials" not in req:
        # Fallback: return whatever is stored in the user profile
        return user.get("profile") or {}

    creds = req["credentials"] or {}
    personal = creds.get("personal") or {}
    family = creds.get("family") or {}
    address = creds.get("address") or {}
    documents = creds.get("documents") or {}

    # Persist to users_collection so future reads from DB are fast
    await db.users_collection.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "profile.personal": personal,
                "profile.family": family,
                "profile.address": address,
                "profile.documents": documents,
                "profile.name": personal.get("full_name"),
                "profile.phone": personal.get("phone_number"),
                "profile.location": address.get("current_posting_address"),
                "profile.job_title": "Policy Maker",
                "profile.department": "Policy Department",
            }
        }
    )

    return {
        "name": personal.get("full_name"),
        "phone": personal.get("phone_number"),
        "location": address.get("current_posting_address"),
        "job_title": "Policy Maker",
        "department": "Policy Department",
        "bio": None,
        "profile_picture": None,
        "personal": personal,
        "family": family,
        "address": address,
        "documents": documents,
    }


@auth_router.post("/logout")
async def logout(request: Request, current_user: dict = Depends(get_current_user), token: str = Depends(oauth2_scheme)):
    """Records logout audit event. Client should discard the JWT."""
    payload = verify_token(token)
    await getattr(db, "token_denylist", db.users_collection.database["token_denylist"]).insert_one({
        "jti": payload["jti"],
        "expires_at": datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    })
    await AuditService.log_action(
        user_id=current_user["_id"],
        username=current_user["username"],
        action="logout",
        ip=request.client.host if request.client else None,
    )
    return {"message": "Logged out successfully"}


# ── Register (admin-only, full user with password) ─────────────────────────────

@auth_router.post("/register")
async def register(user: UserCreate, current_user: dict = Depends(get_admin_user)):
    """Register a new admin-level user (admin only). Use POST /users/ for policy makers."""
    existing = await UserService.get_user_by_username(user.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    new_user = await UserService.create_user(user, created_by=current_user["_id"])

    await AuditService.log_action(
        user_id=current_user["_id"],
        username=current_user["username"],
        action="create_user",
        details={"new_user_id": str(new_user["_id"]), "role": new_user["role"]},
        target_collection="users",
        target_id=new_user["_id"],
    )

    return {
        "id": str(new_user["_id"]),
        "username": new_user["username"],
        "email": new_user["email"],
        "role": new_user["role"],
        "is_active": new_user["is_active"],
    }


# ── Password setup via token ───────────────────────────────────────────────────

class SetPasswordRequest(BaseModel):
    token: str = Field(..., description="Setup token from email link")
    new_password: str = Field(..., min_length=8)


@auth_router.post("/set-password")
async def set_password(body: SetPasswordRequest, request: Request):
    """
    Public endpoint — user sets password using email token (for both setup and reset).
    """
    try:
        user = await UserService.set_password_via_token(body.token, body.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    await AuditService.log_action(
        user_id=user["_id"],
        username=user["username"],
        action="reset_password_completed",
        ip=request.client.host if request.client else None,
    )

    return {"message": "Password updated successfully. You can now log in."}


# ── Forgot Password ────────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


@auth_router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Public endpoint — requests a password reset link.
    Returns 200 even if email not found (security best practice).
    """
    user = await UserService.get_user_by_email(body.email)
    if not user:
        return {"message": "If an account exists with that email, a reset link has been sent."}

    token = await UserService.generate_reset_token(user["_id"])
    
    background_tasks.add_task(
        send_password_reset_email,
        to_email=user["email"],
        username=user.get("name", user["username"]),
        token=token
    )

    await AuditService.log_action(
        user_id=user["_id"],
        username=user["username"],
        action="forgot_password_requested",
        ip=request.client.host if request.client else None,
    )

    return {"message": "Recovery link dispatched. Please check your inbox."}


# ── Profile Management ─────────────────────────────────────────────────────────

from app.services.storage_service import storage_service
from fastapi import UploadFile, File, Form

@auth_router.patch("/profile")
async def update_profile(
    request: Request,
    name: str = Form(None),
    bio: str = Form(None),
    phone: str = Form(None),
    department: str = Form(None),
    job_title: str = Form(None),
    location: str = Form(None),
    avatar: UploadFile = File(None),
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") == "policy_maker":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Policy makers are not allowed to change their profile data."
        )

    update_data = {}

    if avatar:
        if avatar.content_type not in ["image/jpeg", "image/png", "image/webp"]:
            raise HTTPException(400, "Only JPEG, PNG, WebP allowed")
        contents = await avatar.read()
        if len(contents) > 2 * 1024 * 1024:
            raise HTTPException(400, "Image must be under 2MB")
        avatar_url = await storage_service.upload_avatar(
            contents, str(current_user["_id"])
        )
        update_data["profile_picture"] = avatar_url

    for field, value in {
        "name": name, "bio": bio, "phone": phone,
        "department": department, "job_title": job_title,
        "location": location
    }.items():
        if value is not None:
            update_data[field] = value

    if not update_data:
        raise HTTPException(400, "No fields provided to update")

    is_admin = current_user.get("role") == "admin"
    updated = await UserService.update_user(
        user_id=current_user["_id"],
        data=update_data,
        is_admin=is_admin
    )

    await AuditService.log_action(
        user_id=current_user["_id"],
        username=current_user["username"],
        action="profile_updated",
        details={"fields_updated": list(update_data.keys())},
        ip=request.client.host if request.client else None,
    )

    profile = updated.get("profile") or {}
    return {
        "message": "Profile updated successfully",
        "id": str(updated["_id"]),
        "username": updated["username"],
        "email": updated.get("email"),
        "role": updated["role"],
        "is_active": updated.get("is_active", True),
        "last_login_at": updated.get("last_login_at"),
        "created_at": updated.get("created_at"),
        "profile": profile
    }



@auth_router.get("/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") == "policy_maker":
        profile = await _build_pm_profile(current_user)
    else:
        profile = current_user.get("profile") or {}

    return {
        "id": str(current_user["_id"]),
        "username": current_user["username"],
        "email": current_user.get("email"),
        "role": current_user["role"],
        "is_active": current_user.get("is_active", True),
        "last_login_at": current_user.get("last_login_at"),
        "created_at": current_user.get("created_at"),
        "profile": profile
    }


# ── Debug: inspect raw DB data for current PM ─────────────────────────────────

@auth_router.get("/debug/pm-data")
async def debug_pm_data(current_user: dict = Depends(get_current_user)):
    """Debug: return raw verification request and user profile from MongoDB."""
    email = current_user.get("email")
    vreq = await db.pm_verification_requests_collection.find_one({"email": email})

    if vreq:
        creds = vreq.get("credentials") or {}
        vreq_info = {
            "found": True,
            "status": vreq.get("status"),
            "has_credentials_key": "credentials" in vreq,
            "credentials_keys": list(creds.keys()) if creds else [],
            "personal_is_none": creds.get("personal") is None,
            "personal": creds.get("personal"),
            "family": creds.get("family"),
            "address": creds.get("address"),
        }
    else:
        vreq_info = {"found": False}

    user_profile = current_user.get("profile") or {}
    return {
        "email": email,
        "user_profile_keys": list(user_profile.keys()),
        "user_profile": user_profile,
        "verification_request": vreq_info,
    }
