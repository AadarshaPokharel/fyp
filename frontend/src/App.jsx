// src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import AppLayout from "./components/layout/AppLayout";

// Shared/Public Pages
import Login from "./pages/Login";
import SetPassword from "./pages/SetPassword";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile";

// Registration & Verification
import PMRegistration from "./pages/PMRegistration";
import CredentialUpload from "./pages/CredentialUpload";
import LoginSetup from "./pages/LoginSetup";

// Policy Maker Pages
import PMDashboard from "./pages/policymaker/PMDashboard";
import CollisionAnalysis from "./pages/policymaker/CollisionAnalysis";
import InteractivePredict from "./pages/policymaker/InteractivePredict";
import CSVRequests from "./pages/policymaker/CSVRequests";
import PMPolicies from "./pages/policymaker/PMPolicies";
import PolicyCanvas from "./pages/policymaker/PolicyCanvas";
import FinalSubmission from "./pages/policymaker/FinalSubmission";

// Admin Pages
import AdminDashboard from "./pages/admin/AdminDashboard";
import PolicyMakers from "./pages/admin/PolicyMakers";
import AuditLogs from "./pages/admin/AuditLogs";
import AdminDownloads from "./pages/admin/Downloads";
import PMVerificationRequests from "./pages/admin/PMVerificationRequests";
import PMVerificationReport from "./pages/admin/PMVerificationReport";
import AdminPolicies from "./pages/admin/AdminPolicies";
import PolicyReview from "./pages/admin/PolicyReview";

export default function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<PMRegistration />} />
      <Route path="/verify-credentials" element={<CredentialUpload />} />
      <Route path="/setup-password" element={<LoginSetup />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Shared Authenticated Routes */}
      <Route 
        path="/profile" 
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Profile />} />
      </Route>

      {/* Admin Protected Routes */}
      <Route 
        path="/admin" 
        element={
          <ProtectedRoute role="admin">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="policy-makers" element={<PolicyMakers />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="downloads" element={<AdminDownloads />} />
        <Route path="verification" element={<PMVerificationRequests />} />
        <Route path="verification/:id" element={<PMVerificationReport />} />
        <Route path="policies" element={<AdminPolicies />} />
        <Route path="policies/:id" element={<PolicyReview />} />
      </Route>

      {/* Policy Maker Protected Routes */}
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute role="policy_maker">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<PMDashboard />} />
        <Route path="analysis" element={<CollisionAnalysis />} />
        <Route path="predict" element={<InteractivePredict />} />
        <Route path="requests" element={<CSVRequests />} />
        <Route path="policies" element={<PMPolicies />} />
        <Route path="policies/:id/edit" element={<PolicyCanvas />} />
        <Route path="policies/:id/view" element={<PolicyCanvas />} />
        <Route path="policies/new" element={<PolicyCanvas />} />
        <Route path="policies/:id/final" element={<FinalSubmission />} />
      </Route>

      {/* Fallbacks */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
