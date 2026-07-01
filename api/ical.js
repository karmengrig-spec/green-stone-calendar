const firebaseConfig = {
  apiKey: 'AIzaSyACYY5Or9OGv98y9fDxVUqEUzro2CbpoVE',
  authDomain: 'green-stone-calendar.firebaseapp.com',
  projectId: 'green-stone-calendar',
  storageBucket: 'green-stone-calendar.firebasestorage.app',
  messagingSenderId: '946090298149',
  appId: '1:946090298149:web:8a8aa5d4c63d511b1c68cc',
  measurementId: 'G-8YDMZ2SNGS'
};

const firestoreBaseUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

// Read-only Firestore export for the calendar feed.
function formatDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

function nextDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function escapeIcsText(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, ' ');
}

function parseFirestoreDocument(doc) {
  const fields = doc.document?.fields || {};
  return {
    id: doc.document?.name?.split('/').pop() || '',
    start: fields.start?.stringValue || '',
    end: fields.end?.stringValue || '',
    name: fields.name?.stringValue || '',
    note: fields.note?.stringValue || ''
  };
}

async function getBookings(room) {
  const response = await fetch(`${firestoreBaseUrl}:runQuery?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
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
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firestore query failed: ${response.status} ${response.statusText} ${errorText}`);
  }

  const json = await response.json();
  return (Array.isArray(json) ? json : []).filter((item) => item.document).map(parseFirestoreDocument);
}

export default async function handler(req, res) {
  try {
    const room = (req.query.room || '').toString().trim();
    if (!room) {
      return res.status(400).send('Missing room name. Set ?room=<room>.');
    }

    const bookings = await getBookings(room);

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Green Stone Calendar//EN',
      'CALSCALE:GREGORIAN'
    ];

    bookings.forEach((b) => {
      ics.push('BEGIN:VEVENT');
      ics.push(`UID:${b.id}@greenstone`);
      ics.push(`SUMMARY:${escapeIcsText(b.name || 'Booking')}`);
      ics.push(`DTSTART;VALUE=DATE:${formatDate(b.start)}`);
      ics.push(`DTEND;VALUE=DATE:${formatDate(nextDate(b.end))}`);
      if (b.note) {
        ics.push(`DESCRIPTION:${escapeIcsText(b.note)}`);
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
