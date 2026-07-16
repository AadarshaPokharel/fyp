# backend/app/routes/downloads.py
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime
from typing import Optional
import os

from app.core.auth import get_current_user, get_admin_user, get_policy_maker_or_admin
from app.services import DownloadService, AuditService
import app.db as db
from app.services.storage_service import storage_service

downloads_router = APIRouter()


def _serialize(doc: dict) -> dict:
    def _s(v):
        if isinstance(v, ObjectId):
            return str(v)
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    return {
        "id": str(doc["_id"]),
        "user_id": str(doc.get("user_id", "")),
        "date_from": _s(doc.get("date_from")),
        "date_to": _s(doc.get("date_to")),
        "status": doc.get("status"),
        "created_at": _s(doc.get("created_at")),
        "approved_at": _s(doc.get("approved_at")),
        "approved_by": str(doc["approved_by"]) if doc.get("approved_by") else None,
        "rejected_at": _s(doc.get("rejected_at")),
        "rejected_by": str(doc["rejected_by"]) if doc.get("rejected_by") else None,
        "file_key": doc.get("file_key"),
        "file_url": doc.get("file_url"),
        "expires_at": _s(doc.get("expires_at")),
        "user_name": doc.get("user_name", "Policy Maker")
    }


# ── Create request (policy maker) ─────────────────────────────────────────────

class CreateDownloadRequest(BaseModel):
    date_from: datetime
    date_to: datetime


@downloads_router.post("/", status_code=201)
async def create_download_request(
    body: CreateDownloadRequest,
    request: Request,
    current_user: dict = Depends(get_policy_maker_or_admin),
):
    # Set date_to to the very end of that day (23:59:59.999999) to make the date inclusive
    adjusted_date_to = body.date_to.replace(hour=23, minute=59, second=59, microsecond=999999)

    if body.date_from > adjusted_date_to:
        raise HTTPException(status_code=400, detail="date_from must be before or equal to date_to")

    doc = await DownloadService.create_request(
        user_id=current_user["_id"],
        date_from=body.date_from,
        date_to=adjusted_date_to,
    )

    await AuditService.log_action(
        user_id=current_user["_id"],
        username=current_user["username"],
        action="request_download",
        details={"date_from": str(body.date_from), "date_to": str(adjusted_date_to)},
        target_collection="download_requests",
        target_id=doc["_id"],
        ip=request.client.host if request.client else None,
    )

    return _serialize(doc)


# ── List requests ──────────────────────────────────────────────────────────────

@downloads_router.get("/")
async def list_download_requests(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Admins see all; policy makers see only their own."""
    if current_user["role"] == "admin":
        docs = await DownloadService.list_all(skip=skip, limit=limit)
    else:
        docs = await DownloadService.list_by_user(current_user["_id"], skip=skip, limit=limit)
    return [_serialize(d) for d in docs]


# ── Get single request ─────────────────────────────────────────────────────────

@downloads_router.get("/{request_id}")
async def get_download_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request ID")

    doc = await DownloadService.get_by_id(oid)
    if not doc:
        raise HTTPException(status_code=404, detail="Download request not found")

    # Policy makers can only see their own
    if current_user["role"] != "admin" and str(doc["user_id"]) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Not authorized")

    return _serialize(doc)


# ── Approve (admin only) ───────────────────────────────────────────────────────

@downloads_router.patch("/{request_id}/approve")
async def approve_download_request(
    request_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_admin_user),
):
    try:
        oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request ID")

    doc = await DownloadService.get_by_id(oid)
    if not doc:
        raise HTTPException(status_code=404, detail="Download request not found")
    if doc["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {doc['status']}")

    updated = await DownloadService.approve(oid, admin_id=current_user["_id"])
    
    await AuditService.log_action(
        user_id=current_user["_id"],
        username=current_user["username"],
        action="approve_download",
        details={"request_id": request_id},
        target_collection="download_requests",
        target_id=oid,
        ip=request.client.host if request.client else None,
    )

    background_tasks.add_task(DownloadService.generate_csv, oid)

    return _serialize(updated)


@downloads_router.get("/{id}/file")
async def get_download_file(
    id: str,
    current_user=Depends(get_current_user)
):
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(400, "Invalid request ID")

    doc = await db.download_requests_collection.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "Request not found")
    if str(doc["user_id"]) != str(current_user["_id"]) \
       and current_user.get("role") != "admin":
        raise HTTPException(403, "Not authorized")
    if doc.get("status") != "ready":
        raise HTTPException(400, "File is not ready yet")

    # Return Cloudinary URL — frontend handles the download
    return {"download_url": doc["file_url"]}




@downloads_router.delete("/cleanup-expired")
async def cleanup_expired_downloads(
    current_user=Depends(get_admin_user)
):
    """
    Admin manually triggers cleanup of all expired download requests.
    Deletes files from Cloudinary and marks requests as expired in MongoDB.
    """
    expired = await db.download_requests_collection.find({
        "status": "ready",
        "expires_at": {"$lt": datetime.utcnow()}
    }).to_list(None)

    cleaned = 0
    failed = 0
    for req in expired:
        file_key = req.get("file_key")
        if file_key:
            await storage_service.delete_csv(file_key)
        try:
            await db.download_requests_collection.update_one(
                {"_id": req["_id"]},
                {"$set": {
                    "status":   "expired",
                    "file_key": None,
                    "file_url": None
                }}
            )
            cleaned += 1
        except Exception:
            failed += 1

    # Log admin action to audit trail
    await AuditService.log_action(
        user_id=current_user["_id"],
        username=current_user["username"],
        action="cleanup_expired_downloads",
        details={"cleaned": cleaned, "failed": failed}
    )

    return {
        "message": f"Cleanup complete",
        "cleaned": cleaned,
        "failed": failed
    }


# ── Reject (admin only) ────────────────────────────────────────────────────────

@downloads_router.patch("/{request_id}/reject")
async def reject_download_request(
    request_id: str,
    request: Request,
    current_user: dict = Depends(get_admin_user),
):
    try:
        oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request ID")

    doc = await DownloadService.get_by_id(oid)
    if not doc:
        raise HTTPException(status_code=404, detail="Download request not found")
    if doc["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {doc['status']}")

    updated = await DownloadService.reject(oid, admin_id=current_user["_id"])

    await AuditService.log_action(
        user_id=current_user["_id"],
        username=current_user["username"],
        action="reject_download",
        details={"request_id": request_id},
        target_collection="download_requests",
        target_id=oid,
        ip=request.client.host if request.client else None,
    )

    return _serialize(updated)
