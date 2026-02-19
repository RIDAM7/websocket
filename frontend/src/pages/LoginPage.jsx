import { Navigate, useLocation } from "react-router-dom";
import { getAuthUser } from "../lib/auth";

function LoginPage() {
  const user = getAuthUser();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const errorMessage = params.get("error") || "";

  if (user) {
    return <Navigate to="/home" replace />;
  }

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
  const googleLoginUrl = `${apiBaseUrl}/auth/google/start`;

  return (
    <div className="page-shell">
      <main className="page-card login-card">
        <p className="chat-tag">Secure access</p>
        <h1>Sign in to Chat</h1>
        <p className="chat-subtitle">
          Use Google OAuth to access your 1-on-1 WebSocket room.
        </p>

        <a className="primary-btn login-btn" href={googleLoginUrl}>
          Continue with Google
        </a>

        {errorMessage && <p className="error-text">{errorMessage}</p>}
      </main>
    </div>
  );
}

export default LoginPage;
