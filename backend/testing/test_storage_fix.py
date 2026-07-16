import cloudinary.utils
from app.services.storage_service import storage_service
import time

# Mock some data
public_id = "collisionguard/policies/test_file.pdf"

print("--- TESTING PDF (resource_type='raw') ---")
url_raw_download = storage_service.generate_signed_url(public_id, resource_type="raw", attachment=True)
print(f"RAW Download: {url_raw_download}")

print("\n--- TESTING PDF (resource_type='image') ---")
url_img_preview = storage_service.generate_signed_url(public_id, resource_type="image", attachment=False)
print(f"IMG Preview: {url_img_preview}")
url_img_download = storage_service.generate_signed_url(public_id, resource_type="image", attachment=True)
print(f"IMG Download: {url_img_download}")

# Check for fl_attachment
if "fl_attachment" in url_raw_download:
    print("\nSUCCESS: fl_attachment found in raw download URL")
else:
    print("\nFAILURE: fl_attachment missing from raw download URL")

if "fl_attachment" in url_img_download:
    print("SUCCESS: fl_attachment found in image download URL")
else:
    print("FAILURE: fl_attachment missing from image download URL")

# Check that extension isn't mangled
if ".pdf" in url_img_preview and ".jpg" not in url_img_preview:
    print("SUCCESS: PDF extension preserved in preview URL")
else:
    print("FAILURE: PDF extension mangled in preview URL")
