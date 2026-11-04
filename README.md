# C.A.R.T.E.R.

**Personal intelligence, built for the founder.**

Carter is your own private assistant. Talk to it by voice on your computer
("Hey Carter"), or message it from your phone on WhatsApp. It remembers what you
tell it, gives you a daily briefing, researches anything, reads your Gmail and
Google Calendar, can operate your computer when you allow it, and **phones you**
when a reminder is due until you've done it.

Your data stays yours. Carter's memory is a file on your own computer
(`C:\Users\<you>\.carter\memory.json`), and Carter only runs while your
computer is on.

---

## What Carter can do

| | |
|---|---|
| 🎙️ **Voice** | Say "Hey Carter" in the premium gold interface at http://localhost:5180 |
| 📱 **WhatsApp** | Message Carter from your phone, from anywhere, in your "Message yourself" chat |
| 🧠 **Memory** | "Remember that…", "What do you remember about…?" — saved on your PC |
| ☀️ **Daily briefing** | First time you open Carter each day: calendar, important email, reminders |
| 🔎 **Research** | "Research my top three competitors" — summary spoken, full report on screen |
| 📧 **Gmail & Calendar** | Reads and summarises your mail and schedule (see setup below) |
| 📞 **Reminder calls** | "Remind me at 5pm to send the invoice" — Carter **calls you on Telegram** (free) or alarms your phone at 5pm, and again every 30 minutes until you say it's done |
| 🖥️ **Full control** | In full-control mode Carter can run commands, manage files, reply to email and operate your browser |

---

## 1. Install (Windows, one time)

You need **Node.js 20+** (https://nodejs.org) and **Git** (https://git-scm.com).
In **PowerShell**, run one line at a time:

```powershell
cd $HOME
git clone https://github.com/ojemenosedestiny-png/carter-voice.git
cd carter-voice
npm install
```

## 2. Give Carter its brain (your Claude API key)

Create a key at **https://console.anthropic.com → API Keys**, then run (with
your key — never paste it into a chat or a file you commit):

```powershell
setx ANTHROPIC_API_KEY "sk-ant-your-key-here"
```

Optional, for the premium ElevenLabs voice:

```powershell
setx ELEVENLABS_API_KEY "your-elevenlabs-key"
```

**Close PowerShell and open a new one** so these take effect. Then check
everything with:

```powershell
cd $HOME\carter-voice
npm run setup
```

> Pay-as-you-go tip: Carter defaults to the strongest model. To spend less,
> `setx CARTER_MODEL "claude-sonnet-5"`.

## 3. Start Carter

Double-click **`Start Carter.bat`** in the `carter-voice` folder. Keep the black
window open (minimise it). Your browser opens Carter after a few seconds —
click **INITIALISE**, allow the microphone, and say **"Hey Carter"**.

To add Carter to your Start Menu (then press Windows, type *Carter*, Enter):

```powershell
$s = (New-Object -ComObject WScript.Shell).CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Carter.lnk"); $s.TargetPath = "$HOME\carter-voice\Start Carter.bat"; $s.WorkingDirectory = "$HOME\carter-voice"; $s.Save()
```

To start Carter automatically when you log in, copy that shortcut into the
folder that opens with **Win+R → `shell:startup`**.

### Your own web address (Vercel)

Instead of `localhost`, you can open Carter at your own address such as
**https://carter-voice.vercel.app**. Vercel hosts the interface; the brain
(memory, WhatsApp, calls, email) still runs on your PC, so `Start Carter.bat`
must be running and you open the address **on that same PC**.

1. Sign in at https://vercel.com with GitHub, click **Add New → Project**, pick
   **carter-voice**, and click **Deploy** (no settings to change).
2. Note the address Vercel gives you (Project → Domains). You can rename it
   under **Settings → Domains**, or attach a domain you own.
3. Tell your PC's Carter to trust that address and open it (PowerShell):

```powershell
setx CARTER_WEB_URL "https://carter-voice.vercel.app"
```

4. Open a new PowerShell, start Carter, and open your address. The first time,
   Chrome asks to let the site **access devices on your local network** — click
   **Allow** (that is the page reaching Carter's brain on your PC).

Every `git push` to GitHub redeploys the site automatically.

### Full control mode

`Start Carter.bat` is **read-only**: Carter can look at anything and remember
things, but can't send, delete or change anything. To let Carter do any task —
reply to email, run commands, operate your browser and computer — use
**`Start Carter (full control).bat`** instead.

⚠️ In full control, anyone who can message your WhatsApp "Message yourself"
chat (i.e. anyone holding your unlocked phone) can operate your computer.
Keep your phone locked.

## 4. Control Carter from your phone (WhatsApp)

1. Double-click **`Link WhatsApp.bat`**. A QR code appears (also saved as
   `C:\Users\<you>\.carter\whatsapp-qr.png`).
2. On your phone: **WhatsApp → Settings → Linked devices → Link a device**, and
   scan it.
3. When it says *connected*, close that window. From now on, **`Start Carter.bat`
   starts WhatsApp too**.
4. On your phone open **"Message yourself"** (New chat → your own name) and type
   to Carter: *briefing*, *research …*, *remind me at 3pm to …*. Send `/help`
   for the list, `/new` to start a fresh conversation.

### Let Carter answer your friends (guest mode)

Friends message **your normal WhatsApp number** as usual, and Carter answers
them as your assistant. Turn it on from your "Message yourself" chat:

| Send this | What happens |
|---|---|
| `/guests only 2348012345678, 2348098765432` | Carter answers only these people (country code, no +) |
| `/guests on` | Carter answers everyone who messages you (never groups) |
| `/guests off` | Nobody — only you can talk to Carter (the default) |
| `/guests` | Shows the current setting |

What guests get:
- A friendly assistant that answers general questions and can search the web.
- **Only** what you shared for them — say *"Remember for my friends that I'm
  travelling until Monday"*. They can **not** see your email, calendar, files,
  reminders or anything else you told Carter.
- Anything that needs you (a favour, a plan, something private) is **passed to
  your "Message yourself" chat** as 📨 *Ada asks: …*. Answer with
  **"reply to Ada: yes, come at 6"** and Carter sends it to Ada.
- When you reply to someone yourself, Carter stays quiet in that chat for 30
  minutes.

You can also say *"who messaged me?"* or *"tell Bob I'm running late"* any time.

Every guest reply uses your Claude API credit. To make them cheaper, use a
smaller model for guests: `setx CARTER_GUEST_MODEL "claude-haiku-5-5"`.

> ⚠️ This uses WhatsApp's linked-devices feature through an unofficial client
> (Baileys). WhatsApp doesn't officially support it, and automatic replies to
> other people carry more risk of your number being restricted than using it
> only in your own chat. Prefer `/guests only …` with a few friends over
> `/guests on`, and never use it for bulk or unsolicited messages.

## 5. Reminder calls and alarms (free options first)

When a reminder is due, Carter alerts you, then again every 30 minutes (up to
3 times) until you tell it you've done it. Set up **one or more** of these:

### Option A — Telegram call (free, recommended)

Your phone **rings in Telegram** and a voice reads the reminder. Uses the free
CallMeBot service; no ID check.

1. Install **Telegram** and set a username (Telegram → Settings → Username).
2. In Telegram, search for **@CallMeBot_txtbot**, open it and press **Start**
   (this allows it to call you).
3. In PowerShell (with your own username):

```powershell
setx CARTER_TELEGRAM_USER "@yourusername"
```

### Option B — ntfy alarm (free)

A loud, urgent notification on your phone. No account, no ID.

1. Install the **ntfy** app (Play Store / App Store).
2. Invent a long secret topic name, e.g. `carter-founder-7k29q4` (anyone who
   knows the name can see your alerts, so make it hard to guess).
3. In the app tap **+**, enter that topic name, and subscribe. In the
   subscription's settings, set notifications for urgent messages to alarm.
4. In PowerShell:

```powershell
setx CARTER_NTFY_TOPIC "carter-founder-7k29q4"
```

### Option C — Twilio call to your normal number (paid, ID check)

```powershell
setx TWILIO_ACCOUNT_SID "AC..."
setx TWILIO_AUTH_TOKEN "your-auth-token"
```

Or, instead of the Auth Token, a Twilio API key (safer — revocable on its own):

```powershell
setx TWILIO_API_KEY "SK..."
setx TWILIO_API_SECRET "your-api-key-secret"
```

Then your Twilio number and your own number:

```powershell
setx TWILIO_FROM "+1xxxxxxxxxx"
setx CARTER_PHONE "+234xxxxxxxxxx"
```

### Test it

Open a **new** PowerShell, then:

```powershell
cd $HOME\carter-voice
node bridge/reminders.mjs --test
```

Your phone should ring or alarm within a few seconds. Then restart Carter and
say "Remind me at 3pm to call the bank". Change the timing with
`CARTER_REMIND_EVERY_MIN` and `CARTER_REMIND_MAX_CALLS`.

## 6. Gmail & Google Calendar

Carter uses any MCP servers in `C:\Users\<you>\.claude.json`. To add Gmail and
Calendar:

1. At https://console.cloud.google.com create a project, enable the **Gmail API**
   and **Google Calendar API**, set up the OAuth consent screen (add yourself as
   a test user), and create an **OAuth client ID** of type *Desktop app*.
   Download the JSON and save it as `C:\Users\<you>\.google-oauth.json`.
2. Add the servers (PowerShell, one block):

```powershell
node -e "const fs=require('fs'),os=require('os'),p=os.homedir()+'/.claude.json';const c=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{};const cred=os.homedir()+'/.google-oauth.json';c.mcpServers={...(c.mcpServers||{}),gmail:{type:'stdio',command:'npx',args:['-y','@gongrzhe/server-gmail-autoauth-mcp']},'google-calendar':{type:'stdio',command:'npx',args:['-y','@cocal/google-calendar-mcp'],env:{GOOGLE_OAUTH_CREDENTIALS:cred}}};fs.writeFileSync(p,JSON.stringify(c,null,2));console.log('added gmail + google-calendar')"
```

3. Sign in to each (opens your browser):

```powershell
mkdir $HOME\.gmail-mcp -Force; copy $HOME\.google-oauth.json $HOME\.gmail-mcp\gcp-oauth.keys.json; npx -y @gongrzhe/server-gmail-autoauth-mcp auth
$env:GOOGLE_OAUTH_CREDENTIALS="$HOME\.google-oauth.json"; npx -y @cocal/google-calendar-mcp auth
```

4. Restart Carter.

---

## Settings

All optional. Set with `setx NAME "value"` and open a new terminal.

| Variable | What it does | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Carter's brain (your Claude API key) | uses Claude Code login if unset |
| `CARTER_MODEL` | Claude model | `claude-opus-5` |
| `CARTER_EFFORT` | `low` / `medium` / `high` thinking | `high` |
| `ELEVENLABS_API_KEY` | Premium voice and transcription | browser voice |
| `CARTER_VOICE_ID` | ElevenLabs voice id | `p0LiqI2fNYshOoFq2uvR` (the founder's cloned voice) |
| `CARTER_HOME` | Where memory and WhatsApp login are kept | `~\.carter` |
| `CARTER_WHATSAPP_GUESTS` | Starting guest setting: `off`, `all`, or numbers (change any time with `/guests`) | `off` |
| `CARTER_GUEST_MODEL` | Cheaper model for replies to friends | same as `CARTER_MODEL` |
| `CARTER_WEB_URL` | Your Vercel/web address for the interface | `http://localhost:5180` |
| `CARTER_FOUNDER_NAME` | Your name, as Carter says it to friends | your WhatsApp name |
| `CARTER_TELEGRAM_USER` | Free reminder calls in Telegram | off |
| `CARTER_NTFY_TOPIC` | Free urgent reminder alarms (ntfy app) | off |
| `TWILIO_*`, `CARTER_PHONE` | Paid reminder calls to your phone number | off |

## How it's built

Carter is a fork of [JARVIS](https://github.com/adewaskar/jarvis) by Aditya
Dewaskar (MIT licence; the original README is in
[docs/JARVIS-README.md](docs/JARVIS-README.md)). Carter adds the founder
persona and premium interface, long-term memory (`bridge/memory.mjs`), the
daily briefing, the WhatsApp channel (`bridge/whatsapp.mjs`), reminder calls
(`bridge/reminders.mjs`) and the shared tool policy (`bridge/policy.mjs`).

- `npm start` — voice interface + brain + WhatsApp (if linked) + reminder caller
- `npm run start:writes` — the same, with full control
- `npm run whatsapp` — link WhatsApp / run it alone
- `npm run setup` — check your machine
- `node bridge/reminders.mjs --test` — send a test reminder alert
