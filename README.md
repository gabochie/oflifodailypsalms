# Daily Psalms

## Components

### 1. Public Website (`docs/`)

Static landing page hosted on **GitHub Pages**. Displays the daily psalm and lets people sign up.

**Enable GitHub Pages:**
1. Push repo to GitHub
2. Settings > Pages > Source: "Deploy from branch" → `main` / `docs`
3. Site lives at `https://<user>.github.io/oflifo-daily-psalms/`

### 2. Local Marketing Server (`server/`)

All-in-one dashboard: tracks signups from the public site, upload CSV contacts, send WhatsApp/email campaigns.

```bash
cd server
pip install -r requirements.txt
python app.py
```

Open **http://localhost:5050**

### Connect public site to local server

**Testing locally:** open `docs/index.html` directly in browser — it already points to `http://localhost:5050`.

**Production:** expose your local server with ngrok, then update `docs/config.js`:

```js
API_URL: "https://your-ngrok-url.ngrok.io"
```

### .env file

```env
WHATSAPP_PHONE_NUMBER_ID=your_id
WHATSAPP_ACCESS_TOKEN=your_token
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

## Project Structure

```
├── docs/            ← GitHub Pages (public site)
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── config.js
├── server/          ← Local desktop dashboard
│   ├── app.py
│   ├── requirements.txt
│   └── analytics.db (SQLite)
├── .env             ← Credentials
└── README.md
```
