const { google } = require('googleapis');
const { Resend } = require('resend');

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Participants';
const ORGANIZER_EMAIL = 'ouma4walter@gmail.com';
const TOTAL = 50;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, phone } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required.' });

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:D`
    });
    const rows = data.values || [];

    // Duplicate check
    if (rows.some(r => (r[1] || '') === phone)) {
      return res.status(409).json({ error: 'This phone number has already picked a number. Each person can only participate once.' });
    }

    // Used numbers
    const used = rows.map(r => parseInt(r[2])).filter(n => !isNaN(n));
    if (used.length >= TOTAL) {
      return res.status(410).json({ error: 'All 50 gift numbers have been assigned. Thank you for participating!' });
    }

    // Pick random unused
    const available = Array.from({ length: TOTAL }, (_, i) => i + 1).filter(n => !used.includes(n));
    const picked = available[Math.floor(Math.random() * available.length)];

    const now = new Date().toLocaleString('en-KE', {
      timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short'
    });

    // Save to sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:D`,
      valueInputOption: 'RAW',
      requestBody: { values: [[name, phone, picked, now]] }
    });

    // Email organizer
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Gift Draw <onboarding@resend.dev>',
      to: ORGANIZER_EMAIL,
      subject: `🎁 Gift Number ${picked} Assigned — ${name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #ddd;border-radius:12px">
          <h2 style="color:#1a4731;margin-bottom:4px">🎁 New Gift Number Assigned</h2>
          <p style="color:#666;margin-bottom:16px">Kahawa Garrison SDA Church Gift Draw</p>
          <table style="width:100%;border-collapse:collapse;font-size:0.95rem">
            <tr><td style="padding:9px 12px;font-weight:bold;background:#f5f5f5">Name</td><td style="padding:9px 12px">${name}</td></tr>
            <tr><td style="padding:9px 12px;font-weight:bold">Phone</td><td style="padding:9px 12px">${phone}</td></tr>
            <tr><td style="padding:9px 12px;font-weight:bold;background:#f5f5f5">Assigned Number</td>
                <td style="padding:9px 12px;font-size:1.8rem;font-weight:900;color:#1a4731">${picked}</td></tr>
            <tr><td style="padding:9px 12px;font-weight:bold">Date & Time</td><td style="padding:9px 12px">${now}</td></tr>
            <tr><td style="padding:9px 12px;font-weight:bold;background:#f5f5f5">Numbers Remaining</td>
                <td style="padding:9px 12px">${available.length - 1} of ${TOTAL}</td></tr>
          </table>
        </div>`
    });

    return res.status(200).json({ number: picked, remaining: available.length - 1 });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error. Please try again shortly.' });
  }
};