# backend/app/routes/verification.py
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Form
from typing import List, Optional
from bson import ObjectId
import json

from app.core.auth import get_admin_user
from app.services.verification_service import VerificationService
from app.models.verification import PMVerificationRequest, VerificationStatus
# import app.db as db (Moved to local function scopes)
from app.services.storage_service import storage_service
import os
from fastapi.responses import FileResponse
from fastapi import Request

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "credentials")
os.makedirs(UPLOAD_DIR, exist_ok=True)

verification_router = APIRouter()


# ── POLICY MAKER ENDPOINTS ──────────────────────────────────────────────────

@verification_router.post("/register")
async def pm_self_register(email: str = Body(..., embed=True), password: str = Body(..., embed=True)):
    """Stage 1: Policy Maker self-registration."""
    try:
        req = await VerificationService.create_request(email, password)
        return {"message": "Registration request submitted. Please wait for admin approval.", "id": str(req["_id"])}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@verification_router.get("/request/{token}")
async def get_pm_request_by_token(token: str, request: Request):
    """Stage 2: PM retrieves their request to upload credentials."""
    req = await VerificationService.get_request_by_token(token)
    if not req:
        raise HTTPException(status_code=404, detail="Invalid or expired token.")
    
    # Check expiry
    from datetime import datetime, timezone
    if req["token_expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=403, detail="Verification link has expired.")

    # Return necessary data (mask sensitive info if any)
    req["id"] = str(req["_id"])
    del req["_id"]
    if "temp_password_hash" in req: del req["temp_password_hash"]
    
    # Generate signed URLs for existing documents if they are drafts
    if "credentials" in req and "documents" in req["credentials"] and req["credentials"]["documents"]:
        docs = req["credentials"]["documents"]
        signed_docs = {}
        base_url = str(request.base_url).rstrip("/")
        for k, v in docs.items():
            if v and k in ["citizenship_pdf", "traffic_id", "education_certificate", "health_certificate", "training_certificate"]:
                # For PM view, we mostly want previews
                signed_docs[k] = f"{base_url}/verification/files/{v}"
            else:
                signed_docs[k] = v
        req["credentials"]["document_urls"] = signed_docs

    return req


@verification_router.post("/credentials")
async def save_pm_credentials(
    token: str = Form(...),
    is_final: bool = Form(False),
    personal: str = Form(None), # JSON string
    family: str = Form(None),   # JSON string
    address: str = Form(None),  # JSON string
    citizenship_pdf: UploadFile = File(None),
    traffic_id: UploadFile = File(None),
    education_certificate: UploadFile = File(None),
    health_certificate: UploadFile = File(None),
    training_certificate: UploadFile = File(None),
):
    """Stage 2: PM saves credentials (draft or final submission)."""
    req = await VerificationService.get_request_by_token(token)
    if not req:
        raise HTTPException(status_code=404, detail="Invalid token.")

    # Parse JSON fields
    personal_data = json.loads(personal) if personal else req.get("credentials", {}).get("personal")
    family_data = json.loads(family) if family else req.get("credentials", {}).get("family")
    address_data = json.loads(address) if address else req.get("credentials", {}).get("address")
    
    # Handle File Uploads
    doc_refs = req.get("credentials", {}).get("documents", {}) or {}
    
    async def save_file(upload_file: UploadFile, prefix: str):
        if not upload_file: return None
        contents = await upload_file.read()
        ext = upload_file.filename.split(".")[-1] if "." in upload_file.filename else "bin"
        file_name = f"{prefix}_{req['_id']}.{ext}"
        file_path = os.path.join(UPLOAD_DIR, file_name)
        with open(file_path, "wb") as f:
            f.write(contents)
        return file_name

    if citizenship_pdf:
        doc_refs["citizenship_pdf"] = await save_file(citizenship_pdf, "citizenship")
    
    if traffic_id:
        doc_refs["traffic_id"] = await save_file(traffic_id, "traffic_id")

    if education_certificate:
        doc_refs["education_certificate"] = await save_file(education_certificate, "edu_cert")

    if health_certificate:
        doc_refs["health_certificate"] = await save_file(health_certificate, "health_cert")

    if training_certificate:
        doc_refs["training_certificate"] = await save_file(training_certificate, "training_cert")

    data = {
        "personal": personal_data,
        "family": family_data,
        "address": address_data,
        "documents": doc_refs
    }

    success = await VerificationService.save_credentials(token, data, is_final)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to save credentials. Link may have expired.")
    
    return {"message": "Credentials saved successfully" if not is_final else "Credentials submitted for review"}


@verification_router.post("/setup-password")
async def setup_pm_password(token: str = Body(..., embed=True), password: str = Body(..., embed=True)):
    """Stage 4: PM final password setup."""
    success = await VerificationService.complete_setup(token, password)
    if not success:
        raise HTTPException(status_code=400, detail="Invalid or expired setup link.")
    return {"message": "Account activated successfully. You can now log in."}


# ── ADMIN ENDPOINTS ──────────────────────────────────────────────────────────

@verification_router.get("/admin/requests")
async def list_verification_requests(current_admin: dict = Depends(get_admin_user)):
    """Admin: List all pending requests."""
    import app.db as db
    cursor = db.pm_verification_requests_collection.find().sort("created_at", -1)
    requests = await cursor.to_list(length=100)
    for r in requests:
        r["id"] = str(r["_id"])
        del r["_id"]
    return requests


@verification_router.get("/admin/requests/{request_id}")
async def get_verification_report(request_id: str, request: Request, current_admin: dict = Depends(get_admin_user)):
    """Admin: Get detailed credential report with signed document URLs."""
    import app.db as db
    req = await db.pm_verification_requests_collection.find_one({"_id": ObjectId(request_id)})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    
    req["id"] = str(req["_id"])
    del req["_id"]
    
    # Generate signed URLs for documents
    if "credentials" in req and "documents" in req["credentials"] and req["credentials"]["documents"]:
        docs = req["credentials"]["documents"]
        signed_urls = {}
        base_url = str(request.base_url).rstrip("/")
        for k, v in docs.items():
            if v and k in ["citizenship_pdf", "traffic_id", "education_certificate", "health_certificate", "training_certificate"]:
                file_url = f"{base_url}/verification/files/{v}"
                signed_urls[k] = {
                    "preview": file_url,
                    "download": f"{file_url}?download=true",
                    "image_preview": None
                }
            else:
                signed_urls[k] = v
        req["credentials"]["document_urls"] = signed_urls
        
    return req


@verification_router.post("/admin/approve-initial/{request_id}")
async def approve_initial_request(request_id: str, current_admin: dict = Depends(get_admin_user)):
    """Admin: Approve initial request (send upload link)."""
    success = await VerificationService.approve_initial(ObjectId(request_id))
    if not success:
        raise HTTPException(status_code=400, detail="Could not approve request.")
    return {"message": "Initial request approved. Upload link sent to PM."}


@verification_router.post("/admin/reject-initial/{request_id}")
async def reject_initial_request(request_id: str, reason: str = Body(..., embed=True), current_admin: dict = Depends(get_admin_user)):
    """Admin: Reject initial request."""
    success = await VerificationService.reject_initial(ObjectId(request_id), reason)
    if not success:
        raise HTTPException(status_code=400, detail="Could not reject request.")
    return {"message": "Request rejected and email sent."}


@verification_router.post("/admin/approve-credentials/{request_id}")
async def approve_pm_credentials(request_id: str, current_admin: dict = Depends(get_admin_user)):
    """Admin: Final approval of credentials."""
    success = await VerificationService.approve_credentials(ObjectId(request_id))
    if not success:
        raise HTTPException(status_code=400, detail="Could not approve credentials.")
    return {"message": "Credentials approved. Eligibility email sent."}


@verification_router.get("/files/{file_id}")
async def get_verification_file(file_id: str, download: bool = False):
    """Serve locally uploaded verification documents."""
    file_path = os.path.join(UPLOAD_DIR, file_id)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(
        file_path,
        media_type="application/pdf" if file_id.endswith(".pdf") else "application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={file_id}"} if download else None
    )


@verification_router.post("/admin/reject-credentials/{request_id}")
async def reject_pm_credentials(request_id: str, reason: str = Body(..., embed=True), current_admin: dict = Depends(get_admin_user)):
    """Admin: Reject credentials (triggers deletion)."""
    success = await VerificationService.reject_credentials(ObjectId(request_id), reason)
    if not success:
        raise HTTPException(status_code=400, detail="Could not reject credentials.")
    return {"message": "Credentials rejected. All files deleted."}
