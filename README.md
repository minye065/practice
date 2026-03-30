# 練習 — Chinese Flashcard Practice App

A minimalist Chinese character review app. Draw or type your answers on a blank canvas.

---

## Files

```
index.html   — main page
style.css    — all styles
app.js       — all logic
README.md    — this file
```

---

## Hosting on GitHub Pages

### 1. Create a GitHub repository

Go to [github.com](https://github.com) → **New repository**.
Name it anything (e.g. `practice`). Set it to **Public** (required for free GitHub Pages).

### 2. Upload the files

Option A — drag and drop in the browser:
- Open the repo → click **Add file** → **Upload files**
- Drag all four files in → **Commit changes**

Option B — via Git:
```bash
git init
git add .
git commit -m "initial"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 3. Enable GitHub Pages

- Go to your repo → **Settings** → **Pages** (left sidebar)
- Under **Source**, select **Deploy from a branch**
- Branch: `main`, folder: `/ (root)`
- Click **Save**

After ~1 minute your site will be live at:
```
https://YOUR_USERNAME.github.io/YOUR_REPO/
```

No custom domain or extra configuration needed.

---

## Anthropic API key

The app calls the Anthropic API directly from the browser for two features:

1. **Auto-fill** — type Chinese in the set editor, pinyin + English auto-populate
2. **Pinyin candidates** — in practice mode with "Site" support, typing shows candidate Chinese characters

The API key is **not** included in these files — you need to add it.

**Option A (quick/personal use):** Hard-code it in `app.js`. Search for every `fetch('https://api.anthropic.com/v1/messages'` call and add a header:
```js
headers: {
  'Content-Type': 'application/json',
  'x-api-key': 'sk-ant-YOUR_KEY_HERE',
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
},
```

**Option B (shared/public site):** Set up a small proxy server (e.g. a Cloudflare Worker or Vercel Edge Function) that holds the key server-side and forwards requests. Never put your real API key in a public GitHub repo.

---

## Auth & password security

The sign-in system is **client-side only** — accounts and hashed passwords are stored in the browser's `localStorage`. This means:

- ✅ Passwords are hashed with SHA-256 before being stored (never stored as plain text)
- ✅ Good enough for personal/private use on a device you control
- ⚠️  Accounts only exist in that browser — not synced across devices
- ⚠️  Anyone with physical access to the browser can open DevTools and read localStorage
- ❌  Not suitable as real authentication for a shared multi-user site

**For real multi-user auth**, you would need a backend (e.g. Supabase, Firebase, or a custom server) that stores users in a database with properly salted+hashed passwords (bcrypt/argon2). GitHub Pages only serves static files and cannot run a server.

---

## Customising word sets

You can also pre-load sets by editing `app.js`. Find the line:
```js
let sets = JSON.parse(localStorage.getItem('prac-sets') || '[]');
```
And replace `'[]'` with a default set:
```js
let sets = JSON.parse(localStorage.getItem('prac-sets') || JSON.stringify([
  {
    id: 'default',
    name: 'HSK 1 Basics',
    words: [
      { zh: '你好', py: 'nǐ hǎo', en: 'hello' },
      { zh: '谢谢', py: 'xiè xiè', en: 'thank you' },
    ]
  }
]));
```
