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

  return c.json({ success: true, data: { id, status: body.status || 'safe', timestamp: new Date().toISOString() } }, 201);
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

  return c.json({ success: true, data: { id, status: 'emergency', acknowledged: true } }, 201);
});

// Get check-in history
safetyRoutes.get('/history', (c) => {
  const userId = c.req.query('userId') || 'usr_005';
  const checkins = db.query('SELECT * FROM safety_checkins WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20').all(userId);
  return c.json({ success: true, data: checkins });
});
