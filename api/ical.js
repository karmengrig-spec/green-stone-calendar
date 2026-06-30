const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const firebaseApiKey = process.env.FIREBASE_API_KEY;
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const useAdmin = Boolean(serviceAccountRaw);
const useRest = !useAdmin && Boolean(firebaseApiKey && firebaseProjectId);
let db;

async function ensureAdminInitialized() {
  if (db) return;
  // dynamically import admin SDK only when needed
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  let serviceAccount;
  try {
    const raw = serviceAccountRaw.trim();
    const decoded = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    serviceAccount = JSON.parse(decoded);
  } catch (err) {
    throw new Error('Invalid Firebase service account JSON: ' + err.message);
  }

  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
  }

  db = getFirestore();
}

function formatDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

function nextDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function parseFirestoreDocument(doc) {
  const fields = doc.document.fields || {};
  return {
    id: doc.document.name.split('/').pop(),
    start: fields.start?.stringValue || '',
    end: fields.end?.stringValue || '',
    name: fields.name?.stringValue || '',
    note: fields.note?.stringValue || ''
  };
}

async function getBookingsRest(room) {
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents:runQuery?key=${firebaseApiKey}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'bookings' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'room' },
          op: 'EQUAL',
          value: { stringValue: room }
        }
      }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firestore REST query failed: ${response.status} ${response.statusText} ${errorText}`);
  }

  const json = await response.json();
  return json.filter((item) => item.document).map(parseFirestoreDocument);
}

async function getBookingsAdmin(room) {
  const snapshot = await db.collection('bookings').where('room', '==', room).get();
  const bookings = [];
  snapshot.forEach((doc) => bookings.push({ id: doc.id, ...doc.data() }));
  return bookings;
}

export default async function handler(req, res) {
  try {
    const room = (req.query.room || '').toString().trim();
    if (!room) {
      return res.status(400).send('Missing room name. Set ?room=<room>.');
    }

    if (!useAdmin && !useRest) {
      return res.status(500).send('Missing Firebase server configuration. Set FIREBASE_SERVICE_ACCOUNT_BASE64/JSON or FIREBASE_API_KEY and FIREBASE_PROJECT_ID.');
    }

    if (useAdmin) await ensureAdminInitialized();
    const bookings = useAdmin ? await getBookingsAdmin(room) : await getBookingsRest(room);

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Green Stone Calendar//EN',
      'CALSCALE:GREGORIAN'
    ];

    bookings.forEach((b) => {
      ics.push('BEGIN:VEVENT');
      ics.push(`UID:${b.id}@greenstone`);
      ics.push(`SUMMARY:${(b.name || 'Booking').replace(/\r?\n/g, ' ')}`);
      ics.push(`DTSTART;VALUE=DATE:${formatDate(b.start)}`);
      ics.push(`DTEND;VALUE=DATE:${formatDate(nextDate(b.end))}`);
      if (b.note) {
        ics.push(`DESCRIPTION:${b.note.replace(/\r?\n/g, ' ')}`);
      }
      ics.push('END:VEVENT');
    });

    ics.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.status(200).send(ics.join('\r\n'));
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message || 'Server error');
  }
}
