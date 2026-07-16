# backend/app/routes/__init__.py
from fastapi import APIRouter
from .auth import auth_router
from .users import users_router
from .events import events_router
from .predictions import predictions_router
from .downloads import downloads_router
from .predict import predict_router
from .verification import verification_router
from .policies import router as policies_router

router = APIRouter()
router.include_router(auth_router,        prefix="/auth",        tags=["Authentication"])
router.include_router(users_router,       prefix="/users",       tags=["Users"])
router.include_router(events_router,      prefix="/events",      tags=["Events"])
router.include_router(predictions_router, prefix="/predictions", tags=["Predictions"])
router.include_router(downloads_router,   prefix="/downloads",   tags=["Downloads"])
router.include_router(predict_router,     prefix="/predict",     tags=["ML Prediction"])
router.include_router(verification_router, prefix="/verification", tags=["PM Verification"])
router.include_router(policies_router,    prefix="/policies",    tags=["Policies"])

__all__ = ["router"]
