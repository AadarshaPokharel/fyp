# backend/app/core/tasks.py
import asyncio
import logging
from app.services.verification_service import VerificationService

logger = logging.getLogger(__name__)

async def start_verification_maintenance():
    """
    Background loop to handle PM verification lifecycle tasks:
    - 24-hour reminders
    - 6-hour reminders
    - Link expiries (auto-resend or auto-reject)
    Runs every hour.
    """
    logger.info("Verification maintenance task started.")
    while True:
        try:
            logger.info("Running verification maintenance...")
            await VerificationService.run_maintenance_tasks()
            logger.info("Verification maintenance complete. Sleeping for 1 hour.")
        except Exception as e:
            logger.error(f"Error in verification maintenance: {str(e)}", exc_info=True)
        
        # Sleep for 1 hour
        await asyncio.sleep(3600)
