import { Hono } from 'hono';
import { db, generateId } from '../db/database';

export const mediaRoutes = new Hono();

mediaRoutes.get('/', (c) => {
  const storyId = c.req.query('storyId');
  const query = storyId
    ? db.query('SELECT * FROM media WHERE story_id = ? ORDER BY created_at DESC').all(storyId)
    : db.query('SELECT * FROM media ORDER BY created_at DESC LIMIT 50').all();
  return c.json({ success: true, data: query });
});

mediaRoutes.post('/upload', async (c) => {
  // Simulate file upload
  const body = await c.req.json();
  const id = generateId();

  db.run(`
    INSERT INTO media (id, story_id, type, uri, filename, mime_type, size_bytes, duration_ms, width, height, caption, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, body.storyId || null, body.type, body.uri || `/uploads/${id}`,
    body.filename, body.mimeType, body.sizeBytes || 0,
    body.durationMs || null, body.width || null, body.height || null,
    body.caption || null, body.latitude || null, body.longitude || null,
  ]);

  return c.json({ success: true, data: { id, uploadStatus: 'uploaded' } }, 201);
});
