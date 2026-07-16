import asyncio
from app.services.storage_service import storage_service
import urllib.request

async def test():
    pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 0 >>\nstream\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000213 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n264\n%%EOF\n"
    
    pub_id_w_ext = await storage_service.upload_private_document(pdf_content, "test", "test_pdf_storage")
    print("Stored pub_id:", pub_id_w_ext)
    
    url = storage_service.generate_signed_url(pub_id_w_ext)
    print("Signed URL:", url)
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            print("Status:", response.status)
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code)
        
asyncio.run(test())
