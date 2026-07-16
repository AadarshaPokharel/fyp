# backend/app/routes/policies.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Request
from fastapi.responses import FileResponse
import os
from typing import List, Dict, Optional
from pydantic import BaseModel
from datetime import datetime
from bson import ObjectId

from app.core.auth import get_current_user
from app.models.policy import PolicyCreate, PolicyUpdate, PolicyResponse
from app.services.policy_service import policy_service
from app.services.storage_service import storage_service
from app.db import connection as db

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "policies")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.get("/files/{file_id}")
async def get_local_file(file_id: str, download: bool = False):
    file_path = os.path.join(UPLOAD_DIR, file_id)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(
        file_path,
        media_type="application/pdf" if file_id.endswith(".pdf") else "application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={file_id}"} if download else None
    )

@router.get("/", response_model=List[PolicyResponse])
async def get_policies(current_user: dict = Depends(get_current_user)):
    """Get policies based on role. Admins get all, PMs get their own + approved/completed global ones."""
    if current_user["role"] == "admin":
        policies = await policy_service.get_all_policies()
    elif current_user["role"] == "policy_maker":
        # PMs see their own policies AND any approved/completed ones globally
        policies = await policy_service.get_policies_for_pm(str(current_user["_id"]))
    else:
        raise HTTPException(status_code=403, detail="Not authorized")
    return policies

@router.get("/{policy_id}", response_model=PolicyResponse)
async def get_policy(policy_id: str, current_user: dict = Depends(get_current_user)):
    policy = await policy_service.get_policy(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
        
    if current_user["role"] != "admin" and policy["owner_id"] != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to view this policy")
        
    # If admin opens it and it's submitted, mark as under review
    if current_user["role"] == "admin" and policy["status"] == "submitted":
        await policy_service.set_under_review(str(current_user["_id"]), policy_id)
        # Re-fetch after update
        policy = await policy_service.get_policy(policy_id)
        
    return policy

@router.post("/draft", response_model=Dict[str, str])
async def save_policy_draft(
    policy_data: PolicyCreate,
    policy_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Save or create a draft policy."""
    if current_user["role"] not in ["policy_maker", "admin"]:
        raise HTTPException(status_code=403, detail="Only policy makers or admins can create policies")
        
    try:
        pid = await policy_service.create_or_update_draft(str(current_user["_id"]), policy_data, policy_id)
        return {"id": pid, "status": "draft_saved"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{policy_id}/submit")
async def submit_policy(policy_id: str, current_user: dict = Depends(get_current_user)):
    """Submit a draft for review."""
    if current_user["role"] not in ["policy_maker", "admin"]:
        raise HTTPException(status_code=403, detail="Only policy makers or admins can submit policies")
        
    try:
        await policy_service.submit_policy(str(current_user["_id"]), policy_id)
        return {"status": "submitted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

class ReviewAction(BaseModel):
    action: str # "approve", "reject", "close", "extend"
    feedback: Optional[str] = None

@router.post("/{policy_id}/review")
async def review_policy(
    policy_id: str,
    action_data: ReviewAction,
    current_user: dict = Depends(get_current_user)
):
    """Admin reviews a policy."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can review policies")
        
    try:
        await policy_service.review_policy(
            str(current_user["_id"]),
            policy_id,
            action_data.action,
            action_data.feedback
        )
        return {"status": "reviewed"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{policy_id}/upload-supporting-doc")
async def upload_supporting_doc(
    policy_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload supporting document."""
    if current_user["role"] not in ["policy_maker", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    contents = await file.read()
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    file_id = f"policy_supporting_{policy_id}_{int(datetime.utcnow().timestamp())}.{ext}"
    
    try:
        file_path = os.path.join(UPLOAD_DIR, file_id)
        with open(file_path, "wb") as f:
            f.write(contents)

        await db.policies_collection.update_one(
            {"_id": ObjectId(policy_id)},
            {"$set": {"supporting_documents_file_id": file_id}}
        )
        return {"file_id": file_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{policy_id}/final-submission")
async def final_submission(
    policy_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload the final presentation/PDF for an approved policy."""
    if current_user["role"] not in ["policy_maker", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    contents = await file.read()
    try:
        await policy_service.submit_final_documents(
            str(current_user["_id"]),
            policy_id,
            contents,
            file.filename
        )
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{policy_id}/signed-url/{file_field}")
async def get_signed_url(
    policy_id: str, 
    file_field: str, # "supporting_documents_file_id", "final_submission_file_id"
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Generate a local URL for any private policy document."""
    policy = await policy_service.get_policy(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
        
    file_id = policy.get(file_field)
    if not file_id:
        raise HTTPException(status_code=404, detail="File not found")
        
    if current_user["role"] != "admin" and policy["owner_id"] != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    base_url = str(request.base_url).rstrip("/")
    preview_url = f"{base_url}/policies/files/{file_id}"
    download_url = f"{base_url}/policies/files/{file_id}?download=true"
    image_preview = None
    
    return {"url": preview_url, "download_url": download_url, "image_preview": image_preview}

@router.get("/{policy_id}/document-url")
async def get_document_url(policy_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    # Legacy alias for backward compatibility
    return await get_signed_url(policy_id, "final_submission_file_id", request, current_user)

@router.delete("/{policy_id}", status_code=status.HTTP_200_OK)
async def delete_policy(policy_id: str, current_user: dict = Depends(get_current_user)):
    """Permanently delete a policy (admin-only)."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete policies")

    try:
        await policy_service.delete_policy(str(current_user["_id"]), policy_id)
        return {"status": "deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
