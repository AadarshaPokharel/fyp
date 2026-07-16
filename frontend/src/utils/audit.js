/**
 * Formats raw audit log data into plain, human-readable descriptions.
 */
export const formatAuditDetails = (log) => {
  const { action, details = {} } = log;

  switch (action) {
    case "login":
      return "Successfully authenticated and started a new session.";
    
    case "logout":
      return "Securely terminated the session.";
    
    case "request_download": {
      const from = details.date_from ? new Date(details.date_from).toLocaleDateString() : "—";
      const to = details.date_to ? new Date(details.date_to).toLocaleDateString() : "—";
      return `Requested a CSV data export for the period ${from} to ${to}.`;
    }
    
    case "approve_download":
      return "Authorized a pending CSV export request.";
    
    case "reject_download":
      return "Denied a CSV export request.";
    
    case "cleanup_expired_downloads":
      return `Cleaned up ${details.deleted_count || 0} expired download requests.`;
    
    case "create_policy_maker":
      return `Invited a new Policy Maker: ${details.email || "—"}.`;

    case "create_user":
      return `Created a new user account for ${details.email || details.username || "—"}.`;
    
    case "delete_user":
      return "Permanently removed a user account.";
    
    case "update_user": {
      const changes = details.changes ? Object.keys(details.changes).join(", ") : "account settings";
      return `Updated administrative settings for a user (${changes}).`;
    }
    
    case "profile_updated": {
      const fields = details.fields_updated ? details.fields_updated.join(", ") : "details";
      return `Updated personal profile: changed ${fields}.`;
    }
    
    case "bulk_resend_invites":
      return `Initiated bulk re-invitation for ${details.count || 0} pending accounts.`;
    
    case "set_password":
      return "Successfully completed the account setup and set a new password.";

    case "reset_password_completed":
      return "Successfully reset the account password.";

    case "forgot_password_requested":
      return `Requested a password reset link for ${details.email || "their account"}.`;
    
    case "predict":
      return `Generated a risk inference: Result flagged as ${details.collision ? "High Collision Risk" : "Safe"}.`;

    // Policy actions
    case "policy_draft_created":
      return "Created a new policy draft.";

    case "policy_submitted":
      return "Submitted a policy for review.";

    case "policy_final_submission":
      return "Finalized and submitted a policy.";

    case "policy_approved":
      return "Approved a policy submission.";

    case "policy_rejected":
      return "Rejected a policy submission.";

    case "policy_closed":
      return "Closed a policy.";

    case "policy_extension_granted":
      return "Granted an extension for a policy.";

    // Verification actions
    case "auto_reject_pm_request":
      return "Auto-rejected an expired verification request.";
    
    default: {
      // Human-readable fallback: convert action to readable text and summarize details
      const readableAction = action.replaceAll("_", " ");
      if (!details || Object.keys(details).length === 0) {
        return readableAction.charAt(0).toUpperCase() + readableAction.slice(1) + ".";
      }
      const summary = Object.entries(details)
        .filter(([key]) => !key.includes("id")) // Hide raw IDs in fallback too
        .map(([key, val]) => {
          const readableKey = key.replaceAll("_", " ");
          const readableVal = typeof val === "object" ? Object.keys(val).join(", ") : String(val);
          return `${readableKey}: ${readableVal}`;
        })
        .join(", ");
      
      return summary 
        ? `${readableAction.charAt(0).toUpperCase() + readableAction.slice(1)} — ${summary}.`
        : `${readableAction.charAt(0).toUpperCase() + readableAction.slice(1)}.`;
    }
  }
};
