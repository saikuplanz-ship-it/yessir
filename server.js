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
let pendingResolvers = {}; // for interactive auth prompts

// ── Helper: wait for frontend to supply a value ──
function waitForInput(key) {
  return new Promise((resolve) => {
    pendingResolvers[key] = resolve;
  });
}

// ── POST /api/login ──
app.post("/api/login", async (req, res) => {
  const { apiId, apiHash, phone } = req.body;
  if (!apiId || !apiHash || !phone)
    return res.status(400).json({ error: "Missing apiId, apiHash, or phone" });

  try {
    const session = new StringSession(sessionString || "");
    client = new TelegramClient(session, parseInt(apiId), apiHash, {
      connectionRetries: 5,
    });

    await client.start({
      phoneNumber: () => Promise.resolve(phone),
      phoneCode: () => waitForInput("code"),
      password: () => waitForInput("password"),
      onError: (err) => console.error("TG error:", err),
    });

    sessionString = client.session.save();
    res.json({ ok: true, session: sessionString });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/provide — supply code or password during auth ──
app.post("/api/provide", (req, res) => {
  const { key, value } = req.body;
  if (pendingResolvers[key]) {
    pendingResolvers[key](value);
    delete pendingResolvers[key];
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: "No pending prompt for key: " + key });
  }
});

// ── POST /api/resume — resume with saved session string ──
app.post("/api/resume", async (req, res) => {
  const { apiId, apiHash, session } = req.body;
  try {
    client = new TelegramClient(new StringSession(session), parseInt(apiId), apiHash, {
      connectionRetries: 5,
    });
    await client.connect();
    sessionString = session;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/chats — fetch dialogs ──
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

// ── POST /api/send ──
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

// ── GET /api/me ──
app.get("/api/me", async (req, res) => {
  if (!client) return res.status(401).json({ error: "Not logged in" });
  try {
    const me = await client.getMe();
    res.json({ name: me.firstName + (me.lastName ? " " + me.lastName : ""), phone: me.phone });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/logout ──
app.post("/api/logout", async (req, res) => {
  try {
    if (client) await client.destroy();
    client = null;
    sessionString = "";
  } catch (_) {}
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TG Looper running on http://localhost:${PORT}`));
