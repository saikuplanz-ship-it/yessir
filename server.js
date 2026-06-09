const express = require("express");
const cors = require("cors");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;

// ── GLOBAL STATE (simple single-session server) ──
let client = null;
let sessionString = "";

// stores login step per phone (prevents collision)
const loginState = new Map();

// ── CREATE CLIENT ──
async function getClient() {
  if (client) return client;

  client = new TelegramClient(
    new StringSession(sessionString || ""),
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  await client.connect();
  return client;
}

// ── START LOGIN (SEND CODE) ──
app.post("/start-login", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required" });

    const client = await getClient();

    const result = await client.sendCode(
      {
        apiId,
        apiHash,
      },
      phone
    );

    loginState.set(phone, {
      phone,
      phoneCodeHash: result.phoneCodeHash,
    });

    res.json({ success: true, message: "Code sent" });
  } catch (err) {
    console.error("start-login error:", err);
    res.status(500).json({ error: "Failed to send code" });
  }
});

// ── VERIFY CODE (WITH 2FA SUPPORT) ──
app.post("/verify-code", async (req, res) => {
  try {
    const { phone, code, password } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ error: "Phone and code required" });
    }

    const state = loginState.get(phone);
    if (!state) {
      return res.status(400).json({ error: "No login session found" });
    }

    const client = await getClient();

    let user;

    try {
      user = await client.signIn({
        phoneNumber: phone,
        phoneCode: code,
        phoneCodeHash: state.phoneCodeHash,
      });
    } catch (err) {
      // ── 2FA PASSWORD REQUIRED ──
      if (err?.errorMessage === "SESSION_PASSWORD_NEEDED") {
        if (!password) {
          return res.status(401).json({
            error: "2FA password required",
          });
        }

        user = await client.signInWithPassword({
          password,
        });
      } else {
        throw err;
      }
    }

    sessionString = client.session.save();
    loginState.delete(phone);

    res.json({
      success: true,
      session: sessionString,
      user,
    });
  } catch (err) {
    console.error("verify-code error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ── SESSION CHECK ──
app.get("/session", (req, res) => {
  res.json({
    session: sessionString || null,
    loggedIn: !!sessionString,
  });
});

// ── LOGOUT ──
app.post("/logout", async (req, res) => {
  try {
    if (client) {
      await client.disconnect();
    }

    client = null;
    sessionString = "";
    loginState.clear();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Logout failed" });
  }
});

// ── START SERVER ──
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
