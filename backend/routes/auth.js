const crypto = require("crypto");
const express = require("express");
const pool = require("../db");
const { verifyPassword } = require("../password-utils");

const router = express.Router();
const sessions = new Map();

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

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      res.status(400).json({ message: "Email dan password wajib diisi" });
      return;
    }

    const result = await pool.query(
      "SELECT id, email, password_hash, role, name, nim FROM users WHERE LOWER(email) = $1",
      [email]
    );
    const account = result.rows[0];

    if (!account || !verifyPassword(password, account.password_hash)) {
      res.status(401).json({ message: "Email atau password salah" });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, {
      createdAt: Date.now(),
      role: account.role,
      userId: account.id,
      email: account.email,
      name: account.name,
      nim: account.nim,
    });

    res.json({
      token,
      email: account.email,
      name: account.name,
      nim: account.nim,
      role: account.role,
    });
  } catch (error) {
    res.status(500).json({ message: "Login gagal diproses", error: error.message });
  }
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
