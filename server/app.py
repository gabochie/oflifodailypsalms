import csv
import io
import json
import os
import re
import smtplib
import ssl
import sqlite3
from datetime import datetime, date, timedelta
from email.mime.text import MIMEText

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, render_template
from flask_cors import CORS

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), "analytics.db")

WHATSAPP_API_VERSION = "v22.0"
WHATSAPP_BASE = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}"

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS signups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS page_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL DEFAULT '/',
                ip TEXT,
                user_agent TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS uploaded_contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT,
                email TEXT,
                source TEXT DEFAULT 'csv',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS campaigns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel TEXT NOT NULL,
                subject TEXT,
                message TEXT NOT NULL,
                total INTEGER NOT NULL DEFAULT 0,
                sent INTEGER NOT NULL DEFAULT 0,
                failed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS upload_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                inserted INTEGER NOT NULL DEFAULT 0,
                errors TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS campaign_recipients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id INTEGER NOT NULL,
                contact_id INTEGER,
                name TEXT,
                phone TEXT,
                email TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                error TEXT,
                FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
            )
        """)


init_db()

# ---------------------------------------------------------------------------
# Analytics endpoints
# ---------------------------------------------------------------------------

@app.route("/api/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    phone = (data.get("phone") or "").strip()
    if not name or not phone:
        return jsonify({"error": "Name and phone are required"}), 400
    with get_db() as db:
        db.execute("INSERT INTO signups (name, phone) VALUES (?, ?)", (name, phone))
    return jsonify({"ok": True, "message": f"Welcome, {name}!"}), 201


@app.route("/api/signups", methods=["GET"])
def list_signups():
    with get_db() as db:
        rows = db.execute("SELECT id, name, phone, created_at FROM signups ORDER BY created_at DESC").fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/signups/promote", methods=["POST"])
def promote_signups():
    promoted = 0
    with get_db() as db:
        signups = db.execute(
            "SELECT name, phone FROM signups WHERE phone IS NOT NULL AND phone != ''"
        ).fetchall()
        for s in signups:
            existing = db.execute(
                "SELECT id FROM uploaded_contacts WHERE phone=? AND phone IS NOT NULL",
                (s["phone"],),
            ).fetchone()
            if not existing:
                db.execute(
                    "INSERT INTO uploaded_contacts (name, phone, source) VALUES (?, ?, 'signup')",
                    (s["name"], s["phone"]),
                )
                promoted += 1
    return jsonify({"ok": True, "promoted": promoted})


@app.route("/api/pageview", methods=["POST"])
def pageview():
    data = request.get_json(silent=True) or {}
    with get_db() as db:
        db.execute(
            "INSERT INTO page_views (path, ip, user_agent) VALUES (?, ?, ?)",
            (data.get("path", "/"), request.remote_addr, request.headers.get("User-Agent")),
        )
    return jsonify({"ok": True})


@app.route("/api/stats", methods=["GET"])
def stats():
    with get_db() as db:
        total_signups = db.execute("SELECT COUNT(*) FROM signups").fetchone()[0]
        today_signups = db.execute(
            "SELECT COUNT(*) FROM signups WHERE date(created_at) = date('now')"
        ).fetchone()[0]
        total_views = db.execute("SELECT COUNT(*) FROM page_views").fetchone()[0]
        today_views = db.execute(
            "SELECT COUNT(*) FROM page_views WHERE date(created_at) = date('now')"
        ).fetchone()[0]
        recent = db.execute(
            "SELECT name, phone, created_at FROM signups ORDER BY created_at DESC LIMIT 50"
        ).fetchall()
    return jsonify({
        "total_signups": total_signups,
        "today_signups": today_signups,
        "total_views": total_views,
        "today_views": today_views,
        "recent": [dict(r) for r in recent],
    })

# ---------------------------------------------------------------------------
# CSV upload & contacts
# ---------------------------------------------------------------------------

@app.route("/api/contacts/upload", methods=["POST"])
def upload_contacts():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files["file"]
    if not file.filename.endswith(".csv"):
        return jsonify({"error": "Only CSV files accepted"}), 400

    content = file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))
    required = {"name", "phone", "email"}
    cols = {c.strip().lower() for c in reader.fieldnames or []}
    if not cols & required:
        return jsonify({"error": "CSV must have at least one of: Name, Phone, Email"}), 400

    def clean_phone(p):
        cleaned = re.sub(r"[^\d+]", "", p.strip())
        if not cleaned:
            return None
        if cleaned.startswith("+"):
            return cleaned if len(cleaned) >= 8 else None
        return "+" + cleaned if len(cleaned) >= 7 else None

    def clean_email(e):
        e = e.strip().lower()
        return e if re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e) else None

    inserted = 0
    errors = []
    with get_db() as db:
        for i, row in enumerate(reader, start=2):
            row_errors = []
            name = (row.get("Name") or row.get("name") or "").strip()
            phone = (row.get("Phone") or row.get("phone") or "").strip()
            email = (row.get("Email") or row.get("email") or "").strip()

            if not name:
                errors.append({"row": i, "reason": "Missing name", "data": row})
                continue

            phone_clean = clean_phone(phone) if phone else None
            if phone and not phone_clean:
                row_errors.append(f"Invalid phone '{phone}'")

            email_clean = clean_email(email) if email else None
            if email and not email_clean:
                row_errors.append(f"Invalid email '{email}'")

            if phone_clean or email_clean:
                existing = db.execute(
                    "SELECT id FROM uploaded_contacts WHERE (phone=? AND phone IS NOT NULL) OR (email=? AND email IS NOT NULL)",
                    (phone_clean, email_clean),
                ).fetchone()
                if existing:
                    errors.append({"row": i, "reason": "Duplicate contact", "data": {"name": name, "phone": phone_clean, "email": email_clean}})
                    continue

            db.execute(
                "INSERT INTO uploaded_contacts (name, phone, email, source) VALUES (?, ?, ?, 'csv')",
                (name, phone_clean, email_clean),
            )
            inserted += 1
            if row_errors:
                for err in row_errors:
                    errors.append({"row": i, "reason": err, "data": {"name": name}})

    with get_db() as db:
        db.execute(
            "INSERT INTO upload_logs (filename, inserted, errors) VALUES (?, ?, ?)",
            (file.filename, inserted, json.dumps(errors)),
        )
    return jsonify({"ok": True, "inserted": inserted, "errors": errors}), 201


@app.route("/api/contacts", methods=["GET"])
def list_contacts():
    search = request.args.get("q", "").strip()
    with get_db() as db:
        if search:
            rows = db.execute(
                "SELECT * FROM uploaded_contacts WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? ORDER BY created_at DESC",
                (f"%{search}%", f"%{search}%", f"%{search}%"),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM uploaded_contacts ORDER BY created_at DESC"
            ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/contacts/delete", methods=["POST"])
def delete_contacts():
    data = request.get_json(silent=True) or {}
    ids = data.get("ids", [])
    if not ids:
        return jsonify({"error": "No IDs provided"}), 400
    with get_db() as db:
        db.executemany("DELETE FROM uploaded_contacts WHERE id = ?", [(i,) for i in ids])
    return jsonify({"ok": True})


@app.route("/api/uploads", methods=["GET"])
def list_uploads():
    with get_db() as db:
        rows = db.execute("SELECT * FROM upload_logs ORDER BY created_at DESC LIMIT 50").fetchall()
    result = []
    for r in rows:
        item = dict(r)
        item["error_count"] = len(json.loads(item["errors"]))
        result.append(item)
    return jsonify(result)


@app.route("/api/uploads/<int:uid>", methods=["GET"])
def upload_detail(uid):
    with get_db() as db:
        row = db.execute("SELECT * FROM upload_logs WHERE id=?", (uid,)).fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        item = dict(row)
        item["errors"] = json.loads(item["errors"])
    return jsonify(item)


# ---------------------------------------------------------------------------
# Sending helpers
# ---------------------------------------------------------------------------

def send_whatsapp(phone, message):
    pid = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    token = os.getenv("WHATSAPP_ACCESS_TOKEN")
    if not pid or not token:
        raise RuntimeError("WhatsApp credentials not configured")
    url = f"{WHATSAPP_BASE}/{pid}/messages"
    resp = requests.post(url, json={
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": message},
    }, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()


def send_email(to_email, subject, body):
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    pwd = os.getenv("SMTP_PASS")
    if not host or not user or not pwd:
        raise RuntimeError("Email SMTP not configured")

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = user
    msg["To"] = to_email

    ctx = ssl.create_default_context()
    with smtplib.SMTP(host, port) as s:
        s.ehlo()
        s.starttls(context=ctx)
        s.ehlo()
        s.login(user, pwd)
        s.sendmail(user, [to_email], msg.as_string())

# ---------------------------------------------------------------------------
# Campaign / Marketing endpoints
# ---------------------------------------------------------------------------

@app.route("/api/campaign/send", methods=["POST"])
def send_campaign():
    data = request.get_json(silent=True) or {}
    channel = (data.get("channel") or "").strip()
    subject = (data.get("subject") or "").strip()
    message = (data.get("message") or "").strip()
    contact_ids = data.get("contact_ids", [])

    if channel not in ("whatsapp", "email"):
        return jsonify({"error": "Channel must be 'whatsapp' or 'email'"}), 400
    if not message:
        return jsonify({"error": "Message body is required"}), 400
    if channel == "email" and not subject:
        return jsonify({"error": "Subject is required for email"}), 400
    if not contact_ids:
        return jsonify({"error": "No contacts selected"}), 400

    with get_db() as db:
        contacts = db.execute(
            f"SELECT * FROM uploaded_contacts WHERE id IN ({','.join('?' * len(contact_ids))})",
            contact_ids,
        ).fetchall()

    if not contacts:
        return jsonify({"error": "No matching contacts found"}), 400

    # Create campaign record
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO campaigns (channel, subject, message, total) VALUES (?, ?, ?, ?)",
            (channel, subject, message, len(contacts)),
        )
        campaign_id = cur.lastrowid
        for c in contacts:
            db.execute(
                "INSERT INTO campaign_recipients (campaign_id, contact_id, name, phone, email) VALUES (?, ?, ?, ?, ?)",
                (campaign_id, c["id"], c["name"], c["phone"], c["email"]),
            )

    sent = 0
    failed = 0
    failures = []

    for c in contacts:
        try:
            if channel == "whatsapp":
                if not c["phone"]:
                    raise RuntimeError("No phone number")
                send_whatsapp(c["phone"], message)
            else:
                if not c["email"]:
                    raise RuntimeError("No email address")
                send_email(c["email"], subject, message)

            with get_db() as db:
                db.execute(
                    "UPDATE campaign_recipients SET status='sent' WHERE campaign_id=? AND contact_id=?",
                    (campaign_id, c["id"]),
                )
            sent += 1
        except Exception as e:
            err = str(e)
            with get_db() as db:
                db.execute(
                    "UPDATE campaign_recipients SET status='failed', error=? WHERE campaign_id=? AND contact_id=?",
                    (err, campaign_id, c["id"]),
                )
            failed += 1
            failures.append({"name": c["name"], "error": err})

    with get_db() as db:
        db.execute(
            "UPDATE campaigns SET sent=?, failed=? WHERE id=?",
            (sent, failed, campaign_id),
        )

    return jsonify({
        "ok": True,
        "campaign_id": campaign_id,
        "channel": channel,
        "total": len(contacts),
        "sent": sent,
        "failed": failed,
        "failures": failures,
    })


@app.route("/api/campaigns", methods=["GET"])
def list_campaigns():
    with get_db() as db:
        rows = db.execute("SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 50").fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/campaign/<int:c_id>", methods=["GET"])
def campaign_detail(c_id):
    with get_db() as db:
        campaign = db.execute("SELECT * FROM campaigns WHERE id=?", (c_id,)).fetchone()
        if not campaign:
            return jsonify({"error": "Not found"}), 404
        recipients = db.execute(
            "SELECT * FROM campaign_recipients WHERE campaign_id=? ORDER BY status", (c_id,)
        ).fetchall()
    return jsonify({"campaign": dict(campaign), "recipients": [dict(r) for r in recipients]})

# ---------------------------------------------------------------------------
# Dashboard HTML
# ---------------------------------------------------------------------------

@app.route("/")
def dashboard():
    with get_db() as db:
        total_signups = db.execute("SELECT COUNT(*) FROM signups").fetchone()[0]
        today_signups = db.execute(
            "SELECT COUNT(*) FROM signups WHERE date(created_at) = date('now')"
        ).fetchone()[0]
        total_views = db.execute("SELECT COUNT(*) FROM page_views").fetchone()[0]
        today_views = db.execute(
            "SELECT COUNT(*) FROM page_views WHERE date(created_at) = date('now')"
        ).fetchone()[0]
        total_contacts = db.execute("SELECT COUNT(*) FROM uploaded_contacts").fetchone()[0]
        total_campaigns = db.execute("SELECT COUNT(*) FROM campaigns").fetchone()[0]
        unsynced = db.execute("""
            SELECT COUNT(*) FROM signups s
            WHERE s.phone IS NOT NULL AND s.phone != ''
            AND NOT EXISTS (SELECT 1 FROM uploaded_contacts c WHERE c.phone = s.phone)
        """).fetchone()[0]
        recent = db.execute(
            "SELECT name, phone, created_at FROM signups ORDER BY created_at DESC LIMIT 20"
        ).fetchall()

        chart_labels = []
        chart_data = []
        for i in range(6, -1, -1):
            day = (date.today() - timedelta(days=i)).isoformat()
            count = db.execute(
                "SELECT COUNT(*) FROM signups WHERE date(created_at) = ?", (day,)
            ).fetchone()[0]
            chart_labels.append(day[-5:])
            chart_data.append(count)

        campaigns = db.execute(
            "SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 10"
        ).fetchall()

    return render_template("dashboard.html",
        total_signups=total_signups,
        today_signups=today_signups,
        total_views=total_views,
        today_views=today_views,
        total_contacts=total_contacts,
        total_campaigns=total_campaigns,
        unsynced=unsynced,
        recent=[dict(r) for r in recent],
        chart_labels=json.dumps(chart_labels),
        chart_data=json.dumps(chart_data),
        campaigns=[dict(r) for r in campaigns],
    )

if __name__ == "__main__":
    print("Marketing server running at http://localhost:5050")
    app.run(host="127.0.0.1", port=5050, debug=True, use_reloader=False)


