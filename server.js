const express = require("express");
const cors = require("cors");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let client = null;
let sessionString = "";
let pendingResolvers = {};

function waitForInput(key) {
  return new Promise((resolve) => {
    pendingResolvers[key] = resolve;
  });
}

// Step 1 — connect + send code, respond immediately
app.post("/api/login", async (req, res) => {
  const { apiId, apiHash, phone } = req.body;
  if (!apiId || !apiHash || !phone)
    return res.status(400).json({ error: "Missing fields" });

  try {
    const session = new StringSession("");
    client = new TelegramClient(session, parseInt(apiId), apiHash, {
      connectionRetries: 5,
    });
    await client.connect();
    await client.sendCode({ apiId: parseInt(apiId), apiHash }, phone);
    // respond right away so frontend shows code input
    res.json({ ok: true, step: "code" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Step 2 — submit the code
app.post("/api/submit-code", async (req, res) => {
  const { apiId, apiHash, phone, code } = req.body;
  if (!client) return res.status(400).json({ error: "Not connected, call /api/login first" });
  try {
    await client.signIn({ phoneNumber: phone, phoneCode: code, phoneCodeHash: global.lastCodeHash });
    sessionString = client.session.save();
    const me = await client.getMe();
    res.json({ ok: true, name: me.firstName + (me.lastName ? " " + me.lastName : ""), phone: me.phone });
  } catch (e) {
    if (e.errorMessage === "SESSION_PASSWORD_NEEDED") {
      res.json({ ok: true, step: "2fa" });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

// Step 3 — 2FA password
app.post("/api/submit-password", async (req, res) => {
  const { password } = req.body;
  try {
    await client.signInWithPassword(
      { apiId: client.apiId, apiHash: client.apiHash },
      { password: () => Promise.resolve(password), onError: (e) => { throw e; } }
    );
    sessionString = client.session.save();
    const me = await client.getMe();
    res.json({ ok: true, name: me.firstName + (me.lastName ? " " + me.lastName : ""), phone: me.phone });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Resume saved session
app.post("/api/resume", async (req, res) => {
  const { apiId, apiHash, session } = req.body;
  try {
    client = new TelegramClient(new StringSession(session), parseInt(apiId), apiHash, {
      connectionRetries: 5,
    });
    await client.connect();
    sessionString = session;
    const me = await client.getMe();
    res.json({ ok: true, name: me.firstName + (me.lastName ? " " + me.lastName : ""), phone: me.phone });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get chats
app.get("/api/chats", async (req, res) => {
  if (!client) return res.status(401).json({ error: "Not logged in" });
  try {
    const dialogs = await client.getDialogs({ limit: 100 });
    const chats = dialogs.map((d) => ({
      id: d.id?.toString(),
      name: d.title || d.name || "(no name)",
      type: d.isChannel ? "channel" : d.isGroup ? "group" : "dm",
      username: d.entity?.username || null,
    }));
    res.json({ chats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send message
app.post("/api/send", async (req, res) => {
  if (!client) return res.status(401).json({ error: "Not logged in" });
  const { chatId, message } = req.body;
  try {
    await client.sendMessage(chatId, { message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get me
app.get("/api/me", async (req, res) => {
  if (!client) return res.status(401).json({ error: "Not logged in" });
  try {
    const me = await client.getMe();
    res.json({ name: me.firstName + (me.lastName ? " " + me.lastName : ""), phone: me.phone });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Logout
app.post("/api/logout", async (req, res) => {
  try { if (client) await client.destroy(); } catch (_) {}
  client = null;
  sessionString = "";
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TG Looper running on http://localhost:${PORT}`));
