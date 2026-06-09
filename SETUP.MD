# TG Looper — Setup Guide

## What you have
- `server.js` — Node.js backend (handles Telegram MTProto connection)
- `public/index.html` — the GUI (served by the server)
- `package.json` — dependencies
- `Procfile` — for Railway deployment

---

## Option A: Run locally (fastest to test)

### Requirements
- Node.js installed → https://nodejs.org (download LTS)

### Steps
```bash
# 1. install dependencies
npm install

# 2. run the server
node server.js

# 3. open in browser
http://localhost:3000
```

---

## Option B: Deploy to Railway (free, runs 24/7)

### Requirements
- GitHub account
- Railway account → https://railway.app (sign up free with GitHub)

### Steps

**1. Push to GitHub**
```bash
# in the tg-looper folder:
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/YOURUSERNAME/tg-looper.git
git push -u origin main
```

**2. Deploy on Railway**
1. Go to https://railway.app/new
2. Click "Deploy from GitHub repo"
3. Select your `tg-looper` repo
4. Railway auto-detects Node.js and runs `npm start`
5. Click "Generate Domain" under Settings → Networking
6. You get a public URL like `https://tg-looper-production.up.railway.app`
7. Open that URL in any browser — done

### Free tier limits
- 500 hours/month free (enough for 24/7 if you stay under)
- Upgrades to $5/mo for unlimited

---

## Option C: Render.com (also free)

1. Go to https://render.com → New → Web Service
2. Connect GitHub repo
3. Set:
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
4. Deploy → get public URL

---

## Using the tool

1. Open the URL (local or Railway)
2. Enter your **API ID** + **API Hash** from my.telegram.org/apps
3. Enter your **phone number** with country code e.g. `+1234567890`
4. Telegram sends a code to your app → enter it
5. (If you have 2FA) enter your cloud password
6. Your chats + GCs load as a clickable list → select one
7. Type messages one by one → Add to Queue
8. Set your cooldown slider
9. Hit **Start** — it loops and sends
10. Hit **Stop** anytime

### Session saving
After first login your session is saved in the browser so next time
you just enter API ID + Hash and hit "Resume Session" — no code needed.

---

## Notes
- Keep cooldown at **3s+** to avoid Telegram flood limits
- The server handles FLOOD_WAIT automatically (pauses and retries)
- Your API credentials never leave your machine/server
