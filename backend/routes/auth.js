const crypto = require("crypto");
const express = require("express");
const loadEnv = require("../load-env");

loadEnv();

const router = express.Router();
const sessions = new Map();

function getCredentials() {
  return [
    {
      role: "admin",
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD || "admin123",
    },
    {
      role: "user",
      username: process.env.USER_USERNAME || "user",
      password: process.env.USER_PASSWORD || "user123",
    },
  ];
}

function getSession(req) {
  const header = req.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token || !sessions.has(token)) {
    return null;
  }

  return {
    token,
    ...sessions.get(token),
  };
}

function requireAuth(req, res, next) {
  const session = getSession(req);

  if (!session) {
    res.status(401).json({ message: "Sesi login tidak valid" });
    return;
  }

  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  const session = getSession(req);

  if (!session) {
    res.status(401).json({ message: "Sesi admin tidak valid" });
    return;
  }

  if (session.role !== "admin") {
    res.status(403).json({ message: "Akses admin hanya untuk role admin" });
    return;
  }

  req.session = session;
  next();
}

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const account = getCredentials().find(
    (credential) => username === credential.username && password === credential.password
  );

  if (!account) {
    res.status(401).json({ message: "Username atau password salah" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    createdAt: Date.now(),
    role: account.role,
    username: account.username,
  });

  res.json({
    token,
    username: account.username,
    role: account.role,
  });
});

router.post("/logout", requireAuth, (req, res) => {
  sessions.delete(req.session.token);
  res.json({ message: "Logout berhasil" });
});

module.exports = {
  requireAuth,
  requireAdmin,
  router,
};
