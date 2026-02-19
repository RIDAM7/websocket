const jwt = require("jsonwebtoken");

const jwtSecret = process.env.JWT_SECRET || "";

const signAuthToken = (userDoc) => {
  if (!jwtSecret) return null;

  return jwt.sign(
    {
      userId: userDoc._id.toString(),
      sub: userDoc.googleId,
      email: userDoc.email,
      username: userDoc.username,
      role: userDoc.role,
      name: userDoc.displayName || userDoc.username,
      picture: userDoc.picture || "",
    },
    jwtSecret,
    { expiresIn: "7d" }
  );
};

const verifyAuthToken = (token) => {
  if (!jwtSecret) return null;

  try {
    return jwt.verify(token, jwtSecret);
  } catch {
    return null;
  }
};

module.exports = {
  signAuthToken,
  verifyAuthToken,
};
