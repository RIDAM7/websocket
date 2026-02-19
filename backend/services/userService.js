const User = require("../models/user");

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,24}$/;
const ALLOWED_ROLES = ["influencer", "brand"];

const buildBaseUsername = (value) => {
  const raw = `${value || ""}`.trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9._-]/g, "");

  if (cleaned.length >= 3) {
    return cleaned.slice(0, 24);
  }

  return `user${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeEmail = (email) => `${email || ""}`.trim().toLowerCase();

const normalizeUsername = (username) => `${username || ""}`.trim();
const normalizeRole = (role) => `${role || ""}`.trim().toLowerCase();

const validateUsername = (username) => {
  if (!USERNAME_REGEX.test(username)) {
    return {
      valid: false,
      message:
        "Username must be 3-24 chars and only contain letters, numbers, dot, underscore, or hyphen.",
    };
  }

  return { valid: true };
};

const validateRole = (role) => {
  if (!ALLOWED_ROLES.includes(role)) {
    return {
      valid: false,
      message: "Role must be either influencer or brand.",
    };
  }

  return { valid: true };
};

const createUniqueUsername = async (base, excludeUserId = null) => {
  const safeBase = buildBaseUsername(base);
  let candidate = safeBase;
  let counter = 1;

  while (true) {
    const query = { username: candidate };
    if (excludeUserId) {
      query._id = { $ne: excludeUserId };
    }

    const exists = await User.exists(query);
    if (!exists) return candidate;

    const suffix = `${counter}`;
    const maxBaseLength = 24 - suffix.length - 1;
    const trimmedBase = safeBase.slice(0, Math.max(3, maxBaseLength));
    candidate = `${trimmedBase}-${suffix}`;
    counter += 1;
  }
};

const toSafeUser = (userDoc) => ({
  id: userDoc._id.toString(),
  email: userDoc.email,
  username: userDoc.username,
  role: userDoc.role,
  displayName: userDoc.displayName || "",
  picture: userDoc.picture || "",
});

const findUserFromAuthPayload = async (payload) => {
  if (!payload) return null;

  if (payload.userId) {
    const userById = await User.findById(payload.userId);
    if (userById) return userById;
  }

  if (payload.sub) {
    const userByGoogleId = await User.findOne({ googleId: payload.sub });
    if (userByGoogleId) return userByGoogleId;
  }

  if (payload.email) {
    return User.findOne({ email: normalizeEmail(payload.email) });
  }

  return null;
};

const upsertGoogleUser = async (googlePayload) => {
  const googleId = `${googlePayload?.sub || ""}`.trim();
  const email = normalizeEmail(googlePayload?.email || "");
  const displayName = `${googlePayload?.name || ""}`.trim();
  const picture = `${googlePayload?.picture || ""}`.trim();

  if (!googleId || !email) {
    throw new Error("Invalid Google payload.");
  }

  let user =
    (await User.findOne({ googleId })) || (await User.findOne({ email }));

  if (!user) {
    const seed = displayName || email.split("@")[0] || "user";
    const username = await createUniqueUsername(seed);

    user = await User.create({
      googleId,
      email,
      username,
      role: "influencer",
      displayName: displayName || seed,
      picture,
    });

    return user;
  }

  user.googleId = googleId;
  user.email = email;
  user.displayName = displayName || user.displayName || user.username;
  user.picture = picture || user.picture || "";

  if (!user.username) {
    const seed = displayName || email.split("@")[0] || "user";
    user.username = await createUniqueUsername(seed, user._id);
  }

  if (!user.role || !ALLOWED_ROLES.includes(user.role)) {
    user.role = "influencer";
  }

  await user.save();
  return user;
};

const updateUsername = async (userDoc, nextUsernameRaw) => {
  const username = normalizeUsername(nextUsernameRaw);
  const validation = validateUsername(username);

  if (!validation.valid) {
    return { ok: false, status: 400, message: validation.message };
  }

  const isTaken = await User.exists({
    username,
    _id: { $ne: userDoc._id },
  });

  if (isTaken) {
    return { ok: false, status: 409, message: "Username is already taken." };
  }

  userDoc.username = username;
  await userDoc.save();

  return { ok: true, user: userDoc };
};

const updateProfile = async (userDoc, changes = {}) => {
  const hasUsername = typeof changes.username === "string";
  const hasRole = typeof changes.role === "string";

  if (!hasUsername && !hasRole) {
    return {
      ok: false,
      status: 400,
      message: "Provide username or role to update profile.",
    };
  }

  if (hasUsername) {
    const username = normalizeUsername(changes.username);
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return { ok: false, status: 400, message: usernameValidation.message };
    }

    const isTaken = await User.exists({
      username,
      _id: { $ne: userDoc._id },
    });

    if (isTaken) {
      return { ok: false, status: 409, message: "Username is already taken." };
    }

    userDoc.username = username;
  }

  if (hasRole) {
    const role = normalizeRole(changes.role);
    const roleValidation = validateRole(role);
    if (!roleValidation.valid) {
      return { ok: false, status: 400, message: roleValidation.message };
    }

    userDoc.role = role;
  }

  await userDoc.save();
  return { ok: true, user: userDoc };
};

module.exports = {
  ALLOWED_ROLES,
  findUserFromAuthPayload,
  normalizeEmail,
  normalizeRole,
  toSafeUser,
  upsertGoogleUser,
  updateProfile,
  updateUsername,
  validateRole,
  validateUsername,
};
