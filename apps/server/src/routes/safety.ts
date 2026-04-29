import { Hono } from 'hono';
import { db, generateId } from '../db/database';

export const safetyRoutes = new Hono();

// Check in
safetyRoutes.post('/checkin', async (c) => {
  const body = await c.req.json();
  const id = generateId();

  db.run(`
    INSERT INTO safety_checkins (id, user_id, latitude, longitude, altitude, accuracy, status, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, body.userId || 'usr_005',
    body.latitude, body.longitude, body.altitude || null, body.accuracy || null,
    body.status || 'safe', body.message || null,
  ]);

  const checkin = db.query('SELECT * FROM safety_checkins WHERE id = ?').get(id);
  return c.json({ success: true, data: formatCheckIn(checkin) }, 201);
});

// Panic button
safetyRoutes.post('/panic', async (c) => {
  const body = await c.req.json();
  const id = generateId();

  db.run(`
    INSERT INTO safety_checkins (id, user_id, latitude, longitude, status, message)
    VALUES (?, ?, ?, ?, 'emergency', ?)
  `, [id, body.userId || 'usr_005', body.latitude, body.longitude, 'EMERGENCY ALERT TRIGGERED']);

  console.log('🚨 PANIC ALERT from user', body.userId, 'at', body.latitude, body.longitude);

  const checkin = db.query('SELECT * FROM safety_checkins WHERE id = ?').get(id);
  return c.json({ success: true, data: formatCheckIn(checkin) }, 201);
});

// Get check-in history
safetyRoutes.get('/history', (c) => {
  const userId = c.req.query('userId') || 'usr_005';
  const checkins = db.query('SELECT * FROM safety_checkins WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20').all(userId);
  return c.json({ success: true, data: checkins.map(formatCheckIn) });
});

function formatCheckIn(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    location: {
      latitude: row.latitude,
      longitude: row.longitude,
      altitude: row.altitude || undefined,
      accuracy: row.accuracy || undefined,
      timestamp: row.timestamp,
    },
    status: row.status,
    message: row.message || undefined,
    timestamp: row.timestamp,
  };
}
