# OFLIFO Cloudflare Worker

## Setup

```bash
cd worker

# Install wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create oflifo-db

# Copy the database ID from the output and paste it into wrangler.toml
# under database_id = ""

# Apply schema
wrangler d1 migrations apply oflifo-db

# Add secrets
wrangler secret put WHATSAPP_PHONE_NUMBER_ID
wrangler secret put WHATSAPP_ACCESS_TOKEN
wrangler secret put SENDGRID_API_KEY
wrangler secret put SMTP_USER

# Run locally
wrangler dev

# Deploy
wrangler deploy
```

## Dev workflow

1. Run `wrangler dev` for local testing (port 8787)
2. Set `docs/config.js` `API_URL` to `http://localhost:8787`
3. Test signups from the frontend
4. Deploy with `wrangler deploy`
5. Update `docs/config.js` `API_URL` to the production worker URL
