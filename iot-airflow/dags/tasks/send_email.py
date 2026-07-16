"""
tasks/send_email.py — Task: email_summary
Sends HTML pipeline summary email via Gmail SMTP.
"""

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

log = logging.getLogger(__name__)


def send_summary_email(summary: dict) -> str:
    to_addr   = os.getenv("NOTIFY_EMAIL_TO")
    from_addr = os.getenv("NOTIFY_EMAIL_FROM")
    password  = os.getenv("GMAIL_APP_PASSWORD")

    if not to_addr:
        log.info("NOTIFY_EMAIL_TO not set — skipping email.")
        return "skipped"
    if not from_addr or not password:
        log.warning("Email credentials not set — skipping.")
        return "skipped"

    collision_rate = summary.get("collision_rate", 0)
    danger_count   = summary.get("danger_events", 0)
    medium_count   = summary.get("medium_events", 0)
    safe_count     = summary.get("safe_events", 0)
    gold_rows      = summary.get("gold_rows", 0)
    csv_rows       = summary.get("csv_rows", 0)
    run_at         = summary.get("run_at", "")

    if collision_rate >= 0.3:
        color, label, emoji = "#dc2626", "CRITICAL — High Collision Rate", "🚨"
    elif collision_rate >= 0.1:
        color, label, emoji = "#d97706", "WARNING — Elevated Risk", "⚠️"
    else:
        color, label, emoji = "#16a34a", "NORMAL — System Healthy", "✅"

    html = f"""<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{{font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:20px}}
  .card{{background:#fff;border-radius:10px;max-width:600px;margin:0 auto;box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden}}
  .header{{background:{color};padding:24px 28px}}
  .header h1{{color:#fff;margin:0;font-size:20px}}
  .header p{{color:rgba(255,255,255,.85);margin:6px 0 0;font-size:13px}}
  .body{{padding:24px 28px}}
  .grid{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:24px}}
  .stat{{background:#f1f5f9;border-radius:8px;padding:14px 16px}}
  .stat .label{{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}}
  .stat .value{{font-size:26px;font-weight:bold;margin-top:4px;font-family:monospace}}
  .red{{color:#dc2626}}.green{{color:#16a34a}}.blue{{color:#2563eb}}.amber{{color:#d97706}}
  table{{width:100%;border-collapse:collapse;font-size:13px}}
  th{{background:#1e3a5f;color:#fff;padding:9px 12px;text-align:left;font-size:12px}}
  td{{padding:9px 12px;border-bottom:1px solid #e2e8f0;color:#334155}}
  tr:nth-child(even) td{{background:#f8fafc}}
  .footer{{background:#f1f5f9;padding:14px 28px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0}}
  .badge{{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500}}
  .badge-red{{background:#fee2e2;color:#991b1b}}
  .badge-amber{{background:#fef3c7;color:#92400e}}
  .badge-green{{background:#dcfce7;color:#166534}}
</style></head><body>
<div class="card">
  <div class="header">
    <h1>{emoji} IoT Collision Detection Pipeline</h1>
    <p>{label} &nbsp;|&nbsp; {run_at[:19].replace('T',' ')} UTC</p>
  </div>
  <div class="body">
    <div class="grid">
      <div class="stat">
        <div class="label">Danger Events</div>
        <div class="value {'red' if danger_count > 0 else 'green'}">{danger_count:,}</div>
      </div>
      <div class="stat">
        <div class="label">Collision Rate</div>
        <div class="value {'red' if collision_rate >= 0.3 else 'amber' if collision_rate >= 0.1 else 'green'}">{collision_rate:.1%}</div>
      </div>
      <div class="stat">
        <div class="label">Gold Layer Rows</div>
        <div class="value blue">{gold_rows:,}</div>
      </div>
      <div class="stat">
        <div class="label">CSV Rows</div>
        <div class="value blue">{csv_rows:,}</div>
      </div>
    </div>
    <table>
      <tr><th colspan="2">Pipeline Run Summary</th></tr>
      <tr><td>CSV rows processed</td><td><strong>{csv_rows:,}</strong></td></tr>
      <tr><td>Gold layer total</td><td><strong>{gold_rows:,}</strong></td></tr>
      <tr><td>Safe events</td>
          <td><span class="badge badge-green">{safe_count:,}</span></td></tr>
      <tr><td>Medium risk events</td>
          <td><span class="badge badge-amber">{medium_count:,}</span></td></tr>
      <tr><td>Danger events</td>
          <td><span class="badge {'badge-red' if danger_count > 0 else 'badge-green'}">{danger_count:,}</span></td></tr>
      <tr><td>Collision rate</td><td><strong>{collision_rate:.1%}</strong></td></tr>
    </table>
  </div>
  <div class="footer">
    Sent by iot_collision_pipeline Airflow DAG &nbsp;|&nbsp;
    Data source: Snowflake Gold Layer
  </div>
</div></body></html>"""

    subject = f"{emoji} IoT Pipeline — {label} [{run_at[:16].replace('T',' ')}]"
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = from_addr
    msg["To"]      = to_addr
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(from_addr, password)
            server.sendmail(from_addr, to_addr, msg.as_string())
        log.info(f"Email sent to {to_addr}")
        return f"sent:{to_addr}"
    except Exception as e:
        log.error(f"Email failed: {e}")
        return f"error:{e}"