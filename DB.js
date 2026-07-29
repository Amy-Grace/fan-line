// server.js — FanLine backend
// Endpoints:
//   POST /sms/inbound        <- Africa's Talking webhook (fan texts "JOIN <code>")
//   POST /api/broadcast      <- dashboard sends a message to all fans of an artist
//   GET  /api/artists        <- list artists (for dashboard dropdown)
//   GET  /api/fans/:artistId <- fan count + list for one artist
//   GET  /api/broadcasts/:artistId <- broadcast history for one artist

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('js/DB.js');

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true })); // AT webhooks POST as form-encoded
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Africa's Talking SDK setup ---
const AfricasTalking = require('africastalking')({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME, // use "sandbox" for testing
});
const sms = AfricasTalking.SMS;

// Helper: send SMS, logs errors but never throws (so a failed send doesn't crash a request)
async function sendSMS(to, message) {
  try {
    const recipients = Array.isArray(to) ? to : [to];
    const result = await sms.send({
      to: recipients,
      message,
      from: process.env.AT_SENDER_ID || undefined, // omit if you don't have a registered sender ID yet
    });
    console.log('SMS sent:', JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('SMS send failed:', err.message);
    return null;
  }
}

// --- 1. Inbound SMS webhook (fan joins) ---
app.post('/sms/inbound', async (req, res) => {
  // AT posts: from, to, text, date, id (form-encoded)
  const from = req.body.from;
  const text = (req.body.text || '').trim();
  console.log('Inbound SMS:', from, text);

  // Expect "JOIN <code>" (case-insensitive)
  const match = text.match(/^join\s+(\S+)$/i);
  if (!match) {
    // Not a recognized keyword — respond 200 anyway so AT doesn't retry
    return res.sendStatus(200);
  }

  const code = match[1].toUpperCase();
  const artist = db.prepare('SELECT * FROM artists WHERE code = ?').get(code);

  if (!artist) {
    await sendSMS(from, `We couldn't find a fan line with code ${code}. Double-check and try again.`);
    return res.sendStatus(200);
  }

  try {
    db.prepare('INSERT INTO fans (phone, artist_id) VALUES (?, ?)').run(from, artist.id);
    await sendSMS(from, `You've joined ${artist.name}'s fan line! You'll get updates here.`);
  } catch (err) {
    // UNIQUE constraint = already joined
    if (err.message.includes('UNIQUE')) {
      await sendSMS(from, `You're already part of ${artist.name}'s fan line!`);
    } else {
      console.error('DB error on join:', err.message);
    }
  }

  res.sendStatus(200);
});

// --- 2. Broadcast endpoint (artist sends update to all fans) ---
app.post('/api/broadcast', async (req, res) => {
  const { artistId, message } = req.body;
  if (!artistId || !message) {
    return res.status(400).json({ error: 'artistId and message are required' });
  }

  const fans = db.prepare('SELECT phone FROM fans WHERE artist_id = ?').all(artistId);
  if (fans.length === 0) {
    return res.status(400).json({ error: 'No fans yet for this artist' });
  }

  const phones = fans.map((f) => f.phone);
  await sendSMS(phones, message);

  db.prepare('INSERT INTO broadcasts (artist_id, message, recipient_count) VALUES (?, ?, ?)')
    .run(artistId, message, phones.length);

  res.json({ success: true, sentTo: phones.length });
});

// --- 3. List artists ---
app.get('/api/artists', (req, res) => {
  const artists = db.prepare('SELECT * FROM artists').all();
  res.json(artists);
});

// --- 4. Create artist (handy for demoing a second artist live) ---
app.post('/api/artists', (req, res) => {
  const { name, code } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code are required' });
  try {
    const result = db.prepare('INSERT INTO artists (name, code) VALUES (?, ?)').run(name, code.toUpperCase());
    res.json({ id: result.lastInsertRowid, name, code: code.toUpperCase() });
  } catch (err) {
    res.status(400).json({ error: 'Code already taken' });
  }
});

// --- 5. Fans for one artist ---
app.get('/api/fans/:artistId', (req, res) => {
  const fans = db.prepare('SELECT * FROM fans WHERE artist_id = ? ORDER BY joined_at DESC').all(req.params.artistId);
  res.json(fans);
});

// --- 6. Broadcast history for one artist ---
app.get('/api/broadcasts/:artistId', (req, res) => {
  const history = db
    .prepare('SELECT * FROM broadcasts WHERE artist_id = ? ORDER BY sent_at DESC')
    .all(req.params.artistId);
  res.json(history);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FanLine server running on http://localhost:${PORT}`));
