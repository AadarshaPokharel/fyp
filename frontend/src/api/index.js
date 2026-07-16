// src/api/index.js
import api from "./axios";

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (username, password) => {
  const form = new URLSearchParams();
  form.append("username", username);
  form.append("password", password);
  return api.post("/auth/login", form, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
};
export const logout = () => api.post("/auth/logout");
export const getMe = () => api.get("/auth/me");
export const setPassword = (token, new_password) =>
  api.post("/auth/set-password", { token, new_password });
export const forgotPassword = (email) => api.post("/auth/forgot-password", { email });
export const updateProfile = (data) => api.patch("/auth/profile", data);

// ── PM Verification ───────────────────────────────────────────────────────────
export const pmSelfRegister = (email, password) => 
  api.post("/verification/register", { email, password });

export const getVerificationRequest = (token) => 
  api.get(`/verification/request/${token}`);

export const submitCredentials = (formData) => 
  api.post("/verification/credentials", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });

export const setupPMPassword = (token, password) => 
  api.post("/verification/setup-password", { token, password });

// Admin verification management
export const listVerificationRequests = () => api.get("/verification/admin/requests");
export const getVerificationReport = (id) => api.get(`/verification/admin/requests/${id}`);
export const approveInitialRequest = (id) => api.post(`/verification/admin/approve-initial/${id}`);
export const rejectInitialRequest = (id, reason) => api.post(`/verification/admin/reject-initial/${id}`, { reason });
export const approveCredentials = (id) => api.post(`/verification/admin/approve-credentials/${id}`);
export const rejectCredentials = (id, reason) => api.post(`/verification/admin/reject-credentials/${id}`, { reason });

// ── Users ─────────────────────────────────────────────────────────────────────
export const listUsers = (role) =>
  api.get("/users/", { params: role ? { role } : {} });
export const createPolicyMaker = (name, email) =>
  api.post("/users/", { name, email });
export const getUser = (id) => api.get(`/users/${id}`);
export const updateUser = (id, data) => api.patch(`/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/users/${id}`);
export const resendInvite = (id) => api.post(`/users/${id}/resend-invite`);
export const resendAllInvites = () => api.post("/users/admin/resend-all-invites");
export const getAuditLogs = (params) =>
  api.get("/users/admin/audit-logs", { params });

// ── Events ────────────────────────────────────────────────────────────────────
export const getEvents = (limit = 100) =>
  api.get("/events/", { params: { limit } });
export const getDashboardStats = () => api.get("/events/stats");
export const getSystemResilience = () => api.get("/events/resilience");
export const getRecentEvents = (limit = 20) =>
  api.get("/events/recent", { params: { limit } });
export const getTimeseries = (hours = 24) =>
  api.get("/events/timeseries", { params: { hours } });
export const getMyAuditLogs = () => api.get("/events/my-audit-logs");

// Fetch current user's own audit log summary
export const getMyAuditSummary = async () => {
  const res = await api.get("/events/my-audit-logs", {
    params: { limit: 100 }
  });
  return res.data;
};

// Fetch current user's download requests
export const getMyDownloadRequests = async () => {
  const res = await api.get("/downloads/");
  return res.data;
};

// ── Predictions ───────────────────────────────────────────────────────────────
export const getPredictions = (limit = 100) =>
  api.get("/predictions/", { params: { limit } });
export const runPrediction = (data) => api.post("/predict/", data);

// ── Downloads ─────────────────────────────────────────────────────────────────
export const listDownloads = () => api.get("/downloads/");
export const createDownloadRequest = (date_from, date_to) =>
  api.post("/downloads/", { date_from, date_to });
export const approveDownload = (id) => api.patch(`/downloads/${id}/approve`);
export const rejectDownload = (id) => api.patch(`/downloads/${id}/reject`);

// Download a ready CSV file (opens Cloudinary URL)
export const downloadCSVFile = async (requestId) => {
  const res = await api.get(`/downloads/${requestId}/file`);
  window.open(res.data.download_url, "_blank");
};

// Admin: manually clean up expired downloads
export const cleanupExpiredDownloads = async () => {
  const res = await api.delete("/downloads/cleanup-expired");
  return res.data;
};

export default api;
