# backend/app/core/email.py
import logging
import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from .config import (
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
    SMTP_FROM, SMTP_STARTTLS, FRONTEND_URL
)

logger = logging.getLogger(__name__)


def _build_email_html(title: str, subtitle: str, body: str, button_text: str = None, button_link: str = None) -> str:
    button_html = f"""
        <a href="{button_link}"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#1e40af;
                  color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          {button_text}
        </a>
    """ if button_text and button_link else ""

    return f"""
    <html><body style="font-family:sans-serif;background:#f4f4f4;padding:40px">
      <div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 4px 20px rgba(0,0,0,.08)">
        <h2 style="color:#1e40af;margin-bottom:4px">IoT Collision Prediction System</h2>
        <p style="color:#64748b;margin-top:0">{subtitle}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <h3 style="color:#0f172a;margin-top:0">{title}</h3>
        {body}
        {button_html}
        {f'<p style="font-size:12px;color:#94a3b8">Or copy this URL into your browser:<br><a href="{button_link}" style="color:#3b82f6">{button_link}</a></p>' if button_link else ""}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="font-size:11px;color:#cbd5e1">
          This is an automated system message. Please do not reply directly to this email.
        </p>
      </div>
    </body></html>
    """


async def _send_email(to_email: str, subject: str, html_content: str, plain_text: str = "") -> bool:
    if not SMTP_USER or not SMTP_PASS:
        logger.warning(f"SMTP not configured. Subject: {subject} to {to_email}")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"{subject} — IoT Collision System"
    msg["From"]    = SMTP_FROM or SMTP_USER
    msg["To"]      = to_email

    if plain_text:
        msg.attach(MIMEText(plain_text, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASS,
            use_tls=not SMTP_STARTTLS,
            start_tls=SMTP_STARTTLS,
            timeout=10,
        )
        return True
    except Exception as exc:
        logger.error(f"SMTP failure to {to_email}: {str(exc)}")
        return False


# ── EXISTING WRAPPERS ─────────────────────────────────────────────────────────

async def send_password_setup_email(to_email: str, username: str, token: str) -> bool:
    link = f"{FRONTEND_URL}/set-password?token={token}"
    body = f"<p>Hello <strong>{username}</strong>,</p><p>An admin has created your account. Please click the button below to set your password. This link expires in 24 hours.</p>"
    return await _send_email(to_email, "Set Your Password", _build_email_html("Account Setup", "Action Required", body, "Set My Password", link))

async def send_password_reset_email(to_email: str, username: str, token: str) -> bool:
    link = f"{FRONTEND_URL}/reset-password?token={token}"
    body = f"<p>Hello <strong>{username}</strong>,</p><p>We received a request to reset your password. Please click the button below to choose a new one. This link expires in 2 hours.</p>"
    return await _send_email(to_email, "Reset Your Password", _build_email_html("Password Reset", "Security Update", body, "Reset My Password", link))


# ── NEW VERIFICATION TEMPLATES ───────────────────────────────────────────────

async def send_pm_initial_approval(to_email: str, link: str):
    body = f"<p>Your initial registration request has been <strong>approved</strong>.</p><p>Please use the link below to upload your credentials and complete the verification process. This link is valid for <strong>48 hours</strong>.</p>"
    return await _send_email(to_email, "Credential Upload Request", _build_email_html("Credential Verification", "Registration Progress", body, "Upload Credentials", link))

async def send_pm_rejection(to_email: str, reason: str = "Does not meet eligibility criteria"):
    register_link = f"{FRONTEND_URL}/register/policy-maker"
    body = (
        f"<p>We regret to inform you that your registration request as a Policy Maker has been <strong>declined</strong>.</p>"
        f"<p><strong>Reason:</strong> {reason}</p>"
        f"<p>If you believe this is an error, please contact the administrator.</p>"
        f"<p style='margin-top:16px;padding:14px;background:#f0fdf4;border-left:4px solid #22c55e;border-radius:6px;color:#166534;font-size:13px;'>"
        f"<strong>&#10003; You may reapply:</strong> You are welcome to submit a new application at any time using the same email address."
        f"</p>"
    )
    return await _send_email(to_email, "Registration Request Declined", _build_email_html("Request Rejected", "Status Update", body, "Apply Again", register_link))

async def send_pm_reminder(to_email: str, link: str, hours_left: int):
    body = f"<p>This is a reminder that your credential upload link will expire in <strong>{hours_left} hours</strong>.</p><p>Please complete your submission to avoid auto-rejection of your request.</p>"
    return await _send_email(to_email, f"{hours_left} Hour Reminder", _build_email_html("Urgent: Expiry Reminder", "Action Required", body, "Complete Upload", link))

async def send_pm_auto_resend(to_email: str, link: str, attempt: int):
    body = f"<p>Your previous upload link expired mid-submission. We have automatically re-sent a new link for you.</p><p>This is attempt <strong>{attempt} of 3</strong>. Please complete the process within the next 48 hours.</p>"
    return await _send_email(to_email, "New Upload Link Generated", _build_email_html("Link Re-issued", "Automated Update", body, "Resume Upload", link))

async def send_pm_auto_rejection(to_email: str):
    body = f"<p>Your registration request has been <strong>automatically rejected</strong> after multiple link expiries.</p><p>All uploaded drafts and documents have been permanently deleted from our systems. You may attempt to register again in the future.</p>"
    return await _send_email(to_email, "Request Automatically Closed", _build_email_html("Auto-Rejection Notice", "Status Update", body))

async def send_pm_credential_rejection(to_email: str, reason: str):
    register_link = f"{FRONTEND_URL}/register/policy-maker"
    body = (
        f"<p>After reviewing your submitted credentials, we are unable to proceed with your registration.</p>"
        f"<p><strong>Reason:</strong> {reason}</p>"
        f"<p>As per our security policy, all your submitted documents have been <strong>permanently erased</strong> from our systems.</p>"
        f"<p style='margin-top:16px;padding:14px;background:#f0fdf4;border-left:4px solid #22c55e;border-radius:6px;color:#166534;font-size:13px;'>"
        f"<strong>&#10003; You may reapply:</strong> You are welcome to submit a new application at any time using the same email address. "
        f"Your previous data has been cleared, so you will start with a clean slate."
        f"</p>"
    )
    return await _send_email(to_email, "Verification Declined", _build_email_html("Credentials Rejected", "Status Update", body, "Apply Again", register_link))

async def send_pm_eligibility_approval(to_email: str, link: str):
    body = f"<p>Congratulations! Your credentials have been verified, and you are now eligible to access the platform as a <strong>Policy Maker</strong>.</p><p>Click below to complete your final login setup.</p>"
    return await _send_email(to_email, "Verification Successful", _build_email_html("Eligibility Confirmed", "Final Step", body, "Setup Login", link))

async def send_pm_setup_confirmation(to_email: str):
    body = f"<p>Your login setup is complete. You can now access the full Policy Maker dashboard using your new credentials.</p>"
    return await _send_email(to_email, "Account Activated", _build_email_html("Welcome Aboard", "Setup Complete", body, "Go to Dashboard", f"{FRONTEND_URL}/login"))

# ── POLICY MANAGEMENT TEMPLATES ──────────────────────────────────────────────

async def send_policy_submitted(to_email: str, pm_name: str, title: str):
    body = f"<p>Dear <strong>{pm_name}</strong>,</p><p>Your policy <strong>'{title}'</strong> has been successfully submitted and is now pending admin review.</p><p>You will be notified once the review is complete.</p>"
    return await _send_email(to_email, "Policy Submitted", _build_email_html("Submission Received", "Status Update", body))

async def send_policy_rejection(to_email: str, pm_name: str, title: str, feedback: str, revisions_left: int):
    link = f"{FRONTEND_URL}/dashboard/policies"
    if revisions_left > 0:
        body = f"<p>Dear <strong>{pm_name}</strong>,</p><p>Your policy <strong>'{title}'</strong> has been reviewed and requires revisions.</p><p><strong>Feedback:</strong> {feedback}</p><p>You have <strong>{revisions_left}</strong> revision(s) remaining. Please update your draft and resubmit.</p>"
    else:
        body = f"<p>Dear <strong>{pm_name}</strong>,</p><p>Your policy <strong>'{title}'</strong> has been reviewed and requires revisions.</p><p><strong>Feedback:</strong> {feedback}</p><p>You have no standard revisions remaining. Further action requires admin extension.</p>"
    return await _send_email(to_email, "Policy Revision Required", _build_email_html("Revision Requested", "Action Required", body, "View Policy", link))

async def send_policy_approval(to_email: str, pm_name: str, title: str):
    link = f"{FRONTEND_URL}/dashboard/policies"
    body = f"<p>Dear <strong>{pm_name}</strong>,</p><p>Great news! Your policy <strong>'{title}'</strong> has been <strong>approved</strong> by the administration.</p><p>To formally complete this process, you must now submit a <strong>detailed description and presentation</strong> of the policy. Please click the link below to provide your final submission. Note that the original policy and its attached files are securely stored and available for download by the administrative team.</p>"
    return await _send_email(to_email, "Policy Approved - Final Submission Required", _build_email_html("Policy Approved", "Next Steps", body, "Submit Final Documents", link))

async def send_final_submission_received(to_email: str, pm_name: str, title: str):
    body = f"<p>Dear <strong>{pm_name}</strong>,</p><p>We have successfully received your final submission for the policy <strong>'{title}'</strong>.</p><p>Your policy is now officially completed and permanently archived in our records.</p>"
    return await _send_email(to_email, "Final Submission Received", _build_email_html("Policy Completed", "Status Update", body))

async def send_policy_closed(to_email: str, pm_name: str, title: str):
    body = f"<p>Dear <strong>{pm_name}</strong>,</p><p>Your policy <strong>'{title}'</strong> has been permanently closed by the administration after reaching the maximum number of revisions.</p><p>All associated files have been permanently erased from our cloud storage.</p>"
    return await _send_email(to_email, "Policy Permanently Closed", _build_email_html("Policy Closed", "Status Update", body))

async def send_policy_extension(to_email: str, pm_name: str, title: str):
    link = f"{FRONTEND_URL}/dashboard/policies"
    body = f"<p>Dear <strong>{pm_name}</strong>,</p><p>An administrator has granted you an extension to revise your policy <strong>'{title}'</strong> one more time.</p><p>Please review the feedback carefully and submit your final revision.</p>"
    return await _send_email(to_email, "Policy Revision Extension Granted", _build_email_html("Extension Granted", "Action Required", body, "Revise Policy", link))


async def send_pm_deleted(to_email: str, pm_name: str):
    register_link = f"{FRONTEND_URL}/register"
    body = (
        f"<p>Dear <strong>{pm_name}</strong>,</p>"
        f"<p>We are writing to inform you that your Policy Maker account has been <strong>deleted by the administrator</strong>.</p>"
        f"<p>As per our strict data retention and privacy policies, <strong>all of your personal data, credentials, uploaded documents, policies, and download requests have been permanently and completely deleted</strong> from our systems.</p>"
        f"<p style='margin-top:16px;padding:14px;background:#f0fdf4;border-left:4px solid #22c55e;border-radius:6px;color:#166534;font-size:13px;'>"
        f"<strong>&#10003; Clean Slate Re-application:</strong> If you wish to rejoin the platform, you are welcome to submit a fresh application at any time using this email address."
        f"</p>"
    )
    return await _send_email(to_email, "Account Deleted", _build_email_html("Account Permanently Deleted", "Status Update", body, "Apply Again", register_link))

