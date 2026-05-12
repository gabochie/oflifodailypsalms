import { renderDashboard } from './dashboard.js';

const WHATSAPP_BASE = 'https://graph.facebook.com/v22.0';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Phone / Email cleaners ──
function cleanPhone(p) {
  const cleaned = p.replace(/[^\d+]/g, '').trim();
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) return cleaned.length >= 8 ? cleaned : null;
  return cleaned.length >= 7 ? '+' + cleaned : null;
}

function cleanEmail(e) {
  e = e.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

// ── Send helpers ──
async function sendWhatsApp(phone, message, env) {
  const pid = env.WHATSAPP_PHONE_NUMBER_ID;
  const token = env.WHATSAPP_ACCESS_TOKEN;
  if (!pid || !token) throw new Error('WhatsApp not configured');

  const resp = await fetch(`${WHATSAPP_BASE}/${pid}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message },
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`WhatsApp API error: ${err}`);
  }
  return resp.json();
}

async function sendEmail(to, subject, body, env) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) throw new Error('Email not configured');

  const msg = `From: ${SMTP_USER}\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;

  const resp = await fetch(`https://api.sendgrid.com/v3/mail/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: SMTP_USER },
      subject,
      content: [{ type: 'text/plain', value: body }],
    }),
  });
  if (!resp.ok) throw new Error(`Email send failed: ${await resp.text()}`);
}

// ── Router ──
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

    const db = env.DB;

    try {
      // ── Dashboard HTML ──
      if (path === '/' && method === 'GET') {
        return await handleDashboard(db, env);
      }

      // ── API: Signup ──
      if (path === '/api/signup' && method === 'POST') {
        return await handleSignup(request, db);
      }

      // ── API: Page view ──
      if (path === '/api/pageview' && method === 'POST') {
        return await handlePageView(request, db);
      }

      // ── API: Stats ──
      if (path === '/api/stats' && method === 'GET') {
        return await handleStats(db);
      }

      // ── API: Signups list ──
      if (path === '/api/signups' && method === 'GET') {
        return await handleSignupsList(db);
      }

      // ── API: Promote signups ──
      if (path === '/api/signups/promote' && method === 'POST') {
        return await handlePromoteSignups(db);
      }

      // ── API: Upload CSV ──
      if (path === '/api/contacts/upload' && method === 'POST') {
        return await handleUploadCsv(request, db);
      }

      // ── API: Contacts list ──
      if (path === '/api/contacts' && method === 'GET') {
        return await handleContactsList(request, db);
      }

      // ── API: Contacts delete ──
      if (path === '/api/contacts/delete' && method === 'POST') {
        return await handleContactsDelete(request, db);
      }

      // ── API: Campaign send ──
      if (path === '/api/campaign/send' && method === 'POST') {
        return await handleCampaignSend(request, db, env);
      }

      // ── API: Campaigns list ──
      if (path === '/api/campaigns' && method === 'GET') {
        return await handleCampaignsList(db);
      }

      // ── API: Campaign detail ──
      const campaignMatch = path.match(/^\/api\/campaign\/(\d+)$/);
      if (campaignMatch && method === 'GET') {
        return await handleCampaignDetail(db, parseInt(campaignMatch[1]));
      }

      // ── API: Uploads list ──
      if (path === '/api/uploads' && method === 'GET') {
        return await handleUploadsList(db);
      }

      // ── API: Upload detail ──
      const uploadMatch = path.match(/^\/api\/uploads\/(\d+)$/);
      if (uploadMatch && method === 'GET') {
        return await handleUploadDetail(db, parseInt(uploadMatch[1]));
      }

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: err.message }, 500);
    }
  },
};

// ── Handlers ──

async function handleDashboard(db) {
  const sTotal = await db.prepare('SELECT COUNT(*) as c FROM signups').first();
  const sToday = await db.prepare("SELECT COUNT(*) as c FROM signups WHERE date(created_at) = date('now')").first();
  const vTotal = await db.prepare('SELECT COUNT(*) as c FROM page_views').first();
  const vToday = await db.prepare("SELECT COUNT(*) as c FROM page_views WHERE date(created_at) = date('now')").first();
  const cTotal = await db.prepare('SELECT COUNT(*) as c FROM uploaded_contacts').first();
  const campTotal = await db.prepare('SELECT COUNT(*) as c FROM campaigns').first();
  const unsyncedRow = await db.prepare(`SELECT COUNT(*) as c FROM signups s WHERE s.phone IS NOT NULL AND s.phone != '' AND NOT EXISTS (SELECT 1 FROM uploaded_contacts c WHERE c.phone = s.phone)`).first();

  const signupsTotal = sTotal?.c || 0;
  const today_signups = sToday?.c || 0;
  const total_views = vTotal?.c || 0;
  const today_views = vToday?.c || 0;
  const total_contacts = cTotal?.c || 0;
  const total_campaigns = campTotal?.c || 0;
  const unsynced = unsyncedRow?.c || 0;

  const recent = await db.prepare('SELECT name, phone, created_at FROM signups ORDER BY created_at DESC LIMIT 20').all();

  const chartLabels = [];
  const chartData = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    const row = await db.prepare('SELECT COUNT(*) as c FROM signups WHERE date(created_at) = ?').bind(dayStr).first();
    chartLabels.push(dayStr.slice(5));
    chartData.push(row?.c || 0);
  }

  const campaigns = await db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 10').all();

  return html(renderDashboard({
    total_signups: signupsTotal,
    today_signups,
    total_views,
    today_views,
    total_contacts,
    total_campaigns,
    unsynced,
    recent: recent.results || [],
    chart_labels: JSON.stringify(chartLabels),
    chart_data: JSON.stringify(chartData),
    campaigns: campaigns.results || [],
  }));
}

async function handleSignup(request, db) {
  const data = await request.json();
  const name = (data.name || '').trim();
  const phone = (data.phone || '').trim();
  if (!name || !phone) return json({ error: 'Name and phone are required' }, 400);
  await db.prepare('INSERT INTO signups (name, phone) VALUES (?, ?)').bind(name, phone).run();
  return json({ ok: true, message: `Welcome, ${name}!` }, 201);
}

async function handlePageView(request, db) {
  const data = await request.json();
  await db.prepare('INSERT INTO page_views (path) VALUES (?)').bind(data.path || '/').run();
  return json({ ok: true });
}

async function handleStats(db) {
  const totalSignups = (await db.prepare('SELECT COUNT(*) as c FROM signups').first())?.c || 0;
  const todaySignups = (await db.prepare("SELECT COUNT(*) as c FROM signups WHERE date(created_at) = date('now')").first())?.c || 0;
  const totalViews = (await db.prepare('SELECT COUNT(*) as c FROM page_views').first())?.c || 0;
  const todayViews = (await db.prepare("SELECT COUNT(*) as c FROM page_views WHERE date(created_at) = date('now')").first())?.c || 0;
  const recent = await db.prepare('SELECT name, phone, created_at FROM signups ORDER BY created_at DESC LIMIT 50').all();
  return json({
    total_signups: totalSignups,
    today_signups: todaySignups,
    total_views: totalViews,
    today_views: todayViews,
    recent: recent.results || [],
  });
}

async function handleSignupsList(db) {
  const rows = await db.prepare('SELECT id, name, phone, created_at FROM signups ORDER BY created_at DESC').all();
  return json(rows.results || []);
}

async function handlePromoteSignups(db) {
  const signups = await db.prepare("SELECT name, phone FROM signups WHERE phone IS NOT NULL AND phone != ''").all();
  let promoted = 0;
  for (const s of signups.results || []) {
    const existing = await db.prepare('SELECT id FROM uploaded_contacts WHERE phone = ? AND phone IS NOT NULL').bind(s.phone).first();
    if (!existing) {
      await db.prepare("INSERT INTO uploaded_contacts (name, phone, source) VALUES (?, ?, 'signup')").bind(s.name, s.phone).run();
      promoted++;
    }
  }
  return json({ ok: true, promoted });
}

async function handleUploadCsv(request, db) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return json({ error: 'No file provided' }, 400);
  if (!file.name.endsWith('.csv')) return json({ error: 'Only CSV files accepted' }, 400);

  const text = await file.text();
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return json({ error: 'CSV is empty' }, 400);

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const required = new Set(['name', 'phone', 'email']);
  const cols = new Set(headers);
  if (![...required].some(r => cols.has(r))) {
    return json({ error: 'CSV must have at least one of: Name, Phone, Email' }, 400);
  }

  const nameIdx = headers.indexOf('name');
  const phoneIdx = headers.indexOf('phone');
  const emailIdx = headers.indexOf('email');

  let inserted = 0;
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim());
    const name = vals[nameIdx] || '';
    const phone = vals[phoneIdx] || '';
    const email = vals[emailIdx] || '';
    const row = i + 1;

    if (!name) { errors.push({ row, reason: 'Missing name', data: { name: '', phone, email } }); continue; }

    const rowErrors = [];
    const phoneClean = phone ? cleanPhone(phone) : null;
    if (phone && !phoneClean) rowErrors.push(`Invalid phone '${phone}'`);
    const emailClean = email ? cleanEmail(email) : null;
    if (email && !emailClean) rowErrors.push(`Invalid email '${email}'`);

    if (phoneClean || emailClean) {
      const existing = phoneClean
        ? await db.prepare('SELECT id FROM uploaded_contacts WHERE phone = ? AND phone IS NOT NULL').bind(phoneClean).first()
        : await db.prepare('SELECT id FROM uploaded_contacts WHERE email = ? AND email IS NOT NULL').bind(emailClean).first();
      if (existing) { errors.push({ row, reason: 'Duplicate contact', data: { name, phone: phoneClean, email: emailClean } }); continue; }
    }

    await db.prepare("INSERT INTO uploaded_contacts (name, phone, email, source) VALUES (?, ?, ?, 'csv')").bind(name, phoneClean, emailClean).run();
    inserted++;
    rowErrors.forEach(e => errors.push({ row, reason: e, data: { name } }));
  }

  await db.prepare('INSERT INTO upload_logs (filename, inserted, errors) VALUES (?, ?, ?)').bind(file.name, inserted, JSON.stringify(errors)).run();
  return json({ ok: true, inserted, errors }, 201);
}

async function handleContactsList(request, db) {
  const reqUrl = new URL(request.url);
  const q = reqUrl.searchParams.get('q') || '';
  const rows = q
    ? await db.prepare('SELECT * FROM uploaded_contacts WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? ORDER BY created_at DESC').bind(`%${q}%`, `%${q}%`, `%${q}%`).all()
    : await db.prepare('SELECT * FROM uploaded_contacts ORDER BY created_at DESC').all();
  return json(rows.results || []);
}

async function handleContactsDelete(request, db) {
  const data = await request.json();
  const ids = data.ids || [];
  if (!ids.length) return json({ error: 'No IDs provided' }, 400);
  for (const id of ids) {
    await db.prepare('DELETE FROM uploaded_contacts WHERE id = ?').bind(id).run();
  }
  return json({ ok: true });
}

async function handleCampaignSend(request, db, env) {
  const data = await request.json();
  const { channel, subject, message, contact_ids } = data;

  if (!['whatsapp', 'email'].includes(channel)) return json({ error: "Channel must be 'whatsapp' or 'email'" }, 400);
  if (!message) return json({ error: 'Message body is required' }, 400);
  if (channel === 'email' && !subject) return json({ error: 'Subject is required for email' }, 400);
  if (!contact_ids?.length) return json({ error: 'No contacts selected' }, 400);

  const placeholders = contact_ids.map(() => '?').join(',');
  const contacts = await db.prepare(`SELECT * FROM uploaded_contacts WHERE id IN (${placeholders})`).bind(...contact_ids).all();

  if (!contacts.results?.length) return json({ error: 'No matching contacts found' }, 400);

  const camp = await db.prepare('INSERT INTO campaigns (channel, subject, message, total) VALUES (?, ?, ?, ?)').bind(channel, subject || '', message, contacts.results.length).run();
  const campaignId = camp.meta.last_row_id;

  for (const c of contacts.results) {
    await db.prepare('INSERT INTO campaign_recipients (campaign_id, contact_id, name, phone, email) VALUES (?, ?, ?, ?, ?)').bind(campaignId, c.id, c.name, c.phone, c.email).run();
  }

  let sent = 0, failed = 0, failures = [];

  for (const c of contacts.results) {
    try {
      if (channel === 'whatsapp') {
        if (!c.phone) throw new Error('No phone number');
        await sendWhatsApp(c.phone, message, env);
      } else {
        if (!c.email) throw new Error('No email address');
        await sendEmail(c.email, subject, message, env);
      }
      await db.prepare("UPDATE campaign_recipients SET status='sent' WHERE campaign_id=? AND contact_id=?").bind(campaignId, c.id).run();
      sent++;
    } catch (e) {
      await db.prepare("UPDATE campaign_recipients SET status='failed', error=? WHERE campaign_id=? AND contact_id=?").bind(e.message, campaignId, c.id).run();
      failed++;
      failures.push({ name: c.name, error: e.message });
    }
  }

  await db.prepare('UPDATE campaigns SET sent=?, failed=? WHERE id=?').bind(sent, failed, campaignId).run();
  return json({ ok: true, campaign_id: campaignId, channel, total: contacts.results.length, sent, failed, failures });
}

async function handleCampaignsList(db) {
  const rows = await db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 50').all();
  return json(rows.results || []);
}

async function handleCampaignDetail(db, id) {
  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').bind(id).first();
  if (!campaign) return json({ error: 'Not found' }, 404);
  const recipients = await db.prepare('SELECT * FROM campaign_recipients WHERE campaign_id = ? ORDER BY status').bind(id).all();
  return json({ campaign, recipients: recipients.results || [] });
}

async function handleUploadsList(db) {
  const rows = await db.prepare('SELECT * FROM upload_logs ORDER BY created_at DESC LIMIT 50').all();
  const result = (rows.results || []).map(r => ({ ...r, error_count: JSON.parse(r.errors).length }));
  return json(result);
}

async function handleUploadDetail(db, id) {
  const row = await db.prepare('SELECT * FROM upload_logs WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'Not found' }, 404);
  return json({ ...row, errors: JSON.parse(row.errors) });
}
