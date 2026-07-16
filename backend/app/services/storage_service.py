# backend/app/services/storage_service.py
import cloudinary
import cloudinary.uploader
import cloudinary.utils
from app.core import config

cloudinary.config(
    cloud_name=config.CLOUDINARY_CLOUD_NAME,
    api_key=config.CLOUDINARY_API_KEY,
    api_secret=config.CLOUDINARY_API_SECRET,
    secure=True
)

class StorageService:

    # ── AVATARS ───────────────────────────────────────────────

    async def upload_avatar(self, file_bytes: bytes, user_id: str) -> str:
        """Upload profile picture. Returns secure Cloudinary URL."""
        result = cloudinary.uploader.upload(
            file_bytes,
            folder="collisionguard/avatars",
            public_id=f"avatar_{user_id}",
            overwrite=True,
            resource_type="image",
            transformation=[
                {"width": 200, "height": 200, "crop": "fill"},
                {"quality": "auto"},
                {"fetch_format": "auto"}
            ]
        )
        return result["secure_url"]

    async def delete_avatar(self, user_id: str) -> None:
        """Delete avatar when user is deleted."""
        try:
            cloudinary.uploader.destroy(
                f"collisionguard/avatars/avatar_{user_id}",
                resource_type="image"
            )
        except Exception:
            pass

    # ── CSV FILES ─────────────────────────────────────────────

    async def upload_csv(self, csv_content: str, request_id: str) -> tuple[str, str]:
        """Upload CSV to Cloudinary. Returns (file_key, secure_url)."""
        import io
        file_bytes = csv_content.encode("utf-8")
        result = cloudinary.uploader.upload(
            io.BytesIO(file_bytes),
            folder="collisionguard/downloads",
            public_id=f"csv_{request_id}",
            resource_type="raw",
            overwrite=True,
            use_filename=True,
            unique_filename=False,
        )
        return result["public_id"], result["secure_url"]


    async def delete_csv(self, file_key: str) -> None:
        """Delete a CSV file from Cloudinary."""
        try:
            cloudinary.uploader.destroy(file_key, resource_type="raw")
        except Exception:
            pass

    # ── PRIVATE DOCUMENTS ─────────────────────────────────────

    async def upload_private_document(self, file_bytes: bytes, folder: str, public_id: str) -> str:
        """Upload document as private. Returns the public_id."""
        is_pdf = file_bytes[:4] == b"%PDF" or public_id.lower().endswith(".pdf")
        resource_type = "raw" if is_pdf else "auto"

        result = cloudinary.uploader.upload(
            file_bytes,
            folder=f"collisionguard/{folder}",
            public_id=public_id,
            overwrite=True,
            resource_type=resource_type,
            type="private"         # File is not publicly accessible
        )
        return f"{result['public_id']}.{result['format']}"

    def generate_signed_url(
        self,
        public_id: str,
        resource_type: str = "auto",
        format: str = None,
        expiry_seconds: int = 3600,
        attachment: bool = False
    ) -> str:
        """Generate a temporary signed URL for a private resource."""
        import time

        expiry_seconds = expiry_seconds or 3600
        expires_at = int(time.time() + expiry_seconds)

        # Cloudinary automatically maps PDFs and standard images to 'image' resource type, others (ZIP, PPT, etc.) to 'raw'
        if resource_type == "auto":
            ext = public_id.split(".")[-1].lower() if "." in public_id else ""
            if ext in ["pdf", "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff"]:
                resource_type = "image"
            else:
                resource_type = "raw"

        if resource_type == "raw" and public_id.lower().endswith(".pdf"):
            format = format or "pdf"

        options = {
            "sign_url": True,
            "type": "private",
            "resource_type": resource_type,
            "flags": "attachment" if attachment else None,
            "expires_at": expires_at,
            "secure": True,
            "format": format
        }

        # Remove None values so Cloudinary SDK does not receive unsupported keys
        options = {k: v for k, v in options.items() if v is not None}

        url, _ = cloudinary.utils.cloudinary_url(public_id, **options)
        return url


    async def delete_resource(self, public_id: str, resource_type: str = "image") -> bool:
        """Delete any resource from Cloudinary."""
        try:
            # Strip format extension if present, as destroy expects base public_id for images
            base_id = public_id.rsplit('.', 1)[0] if '.' in public_id else public_id
            res = cloudinary.uploader.destroy(base_id, resource_type=resource_type, type="private")
            return res.get("result") == "ok"
        except Exception:
            return False

# Singleton — import this everywhere
storage_service = StorageService()
