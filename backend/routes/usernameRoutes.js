const express = require("express");
const { signAuthToken } = require("../auth/jwt");
const { requireAuth } = require("../middleware/requireAuth");
const { toSafeUser, updateProfile, updateUsername } = require("../services/userService");

const router = express.Router();

router.get("/me", requireAuth, (req, res) => {
  res.json({
    user: toSafeUser(req.auth.user),
  });
});

router.patch("/me/username", requireAuth, async (req, res) => {
  const username = req.body?.username;
  const result = await updateUsername(req.auth.user, username);

  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  const token = signAuthToken(result.user);
  res.json({
    token: token || undefined,
    user: toSafeUser(result.user),
  });
});

router.patch("/me/profile", requireAuth, async (req, res) => {
  const result = await updateProfile(req.auth.user, {
    username: req.body?.username,
    role: req.body?.role,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  const token = signAuthToken(result.user);
  res.json({
    token: token || undefined,
    user: toSafeUser(result.user),
  });
});

module.exports = {
  usernameRouter: router,
};
