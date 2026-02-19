const { verifyAuthToken } = require("../auth/jwt");
const { findUserFromAuthPayload } = require("../services/userService");

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : "";

    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const payload = verifyAuthToken(token);
    if (!payload) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await findUserFromAuthPayload(payload);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    req.auth = {
      token,
      payload,
      user,
    };

    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
};

module.exports = {
  requireAuth,
};
