const express = require("express");
const { OAuth2Client } = require("google-auth-library");
const { signAuthToken } = require("../auth/jwt");
const { requireAuth } = require("../middleware/requireAuth");
const { toSafeUser, upsertGoogleUser } = require("../services/userService");

const createGoogleAuthRouter = ({ frontendUrl }) => {
  const router = express.Router();

  const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI || "";

  const oauthConfigured = Boolean(
    googleClientId && googleClientSecret && googleRedirectUri
  );

  const oauthClient = oauthConfigured
    ? new OAuth2Client({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        redirectUri: googleRedirectUri,
      })
    : null;

  if (!oauthConfigured) {
    console.warn(
      "Google OAuth is not fully configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI."
    );
  }

  router.get("/google/start", (_req, res) => {
    if (!oauthClient) {
      res.status(500).json({ error: "Google OAuth is not configured on server." });
      return;
    }

    const authUrl = oauthClient.generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "profile", "email"],
      prompt: "select_account",
    });

    res.redirect(authUrl);
  });

  router.get("/google/callback", async (req, res) => {
    try {
      if (!oauthClient) {
        res.redirect(
          `${frontendUrl}/login?error=${encodeURIComponent(
            "Google OAuth is not configured on server."
          )}`
        );
        return;
      }

      const code = typeof req.query.code === "string" ? req.query.code : "";
      if (!code) {
        res.redirect(
          `${frontendUrl}/login?error=${encodeURIComponent(
            "Missing Google authorization code."
          )}`
        );
        return;
      }

      const { tokens } = await oauthClient.getToken(code);
      const idToken = tokens.id_token || "";

      if (!idToken) {
        res.redirect(
          `${frontendUrl}/login?error=${encodeURIComponent(
            "Google did not return an ID token."
          )}`
        );
        return;
      }

      const ticket = await oauthClient.verifyIdToken({
        idToken,
        audience: googleClientId,
      });

      const googlePayload = ticket.getPayload();
      if (!googlePayload?.sub || !googlePayload?.email) {
        res.redirect(
          `${frontendUrl}/login?error=${encodeURIComponent(
            "Unable to verify Google account."
          )}`
        );
        return;
      }

      const user = await upsertGoogleUser(googlePayload);
      const authToken = signAuthToken(user);

      if (!authToken) {
        res.redirect(
          `${frontendUrl}/login?error=${encodeURIComponent(
            "JWT secret is not configured."
          )}`
        );
        return;
      }

      res.redirect(
        `${frontendUrl}/auth/callback?token=${encodeURIComponent(authToken)}`
      );
    } catch (error) {
      console.error("OAuth callback error:", error.message);
      res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent(
          "Google login failed. Try again."
        )}`
      );
    }
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({
      user: toSafeUser(req.auth.user),
    });
  });

  return router;
};

module.exports = {
  createGoogleAuthRouter,
};
