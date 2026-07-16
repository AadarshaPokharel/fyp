# backend/app/core/config.py
import os
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)
PROJECT_ROOT = env_path.parent

# Database
MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB = os.getenv("MONGO_DB", "iot_collision")

# Security
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# Password Setup Token
SETUP_TOKEN_EXPIRE_HOURS = int(os.getenv("SETUP_TOKEN_EXPIRE_HOURS", "24"))

# ML Model
def _resolve_model_path(raw_path: str | None) -> str | None:
    if not raw_path:
        return None
    p = Path(raw_path).expanduser()
    if p.is_absolute():
        return str(p)
    return str((PROJECT_ROOT / p).resolve())


MODEL_PATH = _resolve_model_path(os.getenv("MODEL_PATH"))

# Frontend URL (for email links)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Email / SMTP
SMTP_HOST     = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")
SMTP_PASS     = os.getenv("SMTP_PASS", "")
SMTP_FROM     = os.getenv("SMTP_FROM", SMTP_USER)
SMTP_STARTTLS = os.getenv("SMTP_STARTTLS", "true").lower() == "true"

# API
API_TITLE = "IoT Collision Prediction API"
API_VERSION = "1.0.0"
API_DESCRIPTION = "REST API for IoT collision detection and ML predictions"

# Cloudinary
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")
