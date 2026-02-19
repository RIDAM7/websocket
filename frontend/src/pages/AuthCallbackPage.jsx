import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { setAuthToken } from "../lib/auth";

function AuthCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("token") || "";
    const error = params.get("error") || "";

    if (token) {
      setAuthToken(token);
      navigate("/home", { replace: true });
      return;
    }

    const loginUrl = error
      ? `/login?error=${encodeURIComponent(error)}`
      : "/login?error=Missing login token.";
    navigate(loginUrl, { replace: true });
  }, [location.search, navigate]);

  return (
    <div className="page-shell">
      <main className="page-card">
        <h1>Completing sign-in...</h1>
      </main>
    </div>
  );
}

export default AuthCallbackPage;
