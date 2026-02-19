const AUTH_TOKEN_KEY = "ws_auth_token";

const parseJwtPayload = (token) => {
  try {
    const [, payloadPart] = token.split(".");
    if (!payloadPart) return null;

    const normalized = payloadPart
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
    const json = atob(normalized);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export const getAuthToken = () => localStorage.getItem(AUTH_TOKEN_KEY) || "";

export const setAuthToken = (token) => {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
};

export const clearAuthToken = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
};

export const getAuthUser = () => {
  const token = getAuthToken();
  if (!token) return null;

  const payload = parseJwtPayload(token);
  if (!payload) {
    clearAuthToken();
    return null;
  }

  if (payload.exp && payload.exp * 1000 < Date.now()) {
    clearAuthToken();
    return null;
  }

  return {
    id: payload.userId || "",
    sub: payload.sub || "",
    name: payload.name || payload.username || payload.email || "Google User",
    username: payload.username || payload.name || payload.email || "Google User",
    role: payload.role || "influencer",
    email: payload.email || "",
    picture: payload.picture || "",
  };
};
