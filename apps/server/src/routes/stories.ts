import { Hono } from 'hono';
import { db, generateId } from '../db/database';

export const storyRoutes = new Hono();

// List stories
storyRoutes.get('/', (c) => {
  const userId = c.req.query('userId') || 'usr_005';
  const status = c.req.query('status');

  let query = 'SELECT * FROM stories WHERE filed_by = ?';
  const params: any[] = [userId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY updated_at DESC';
  const stories = db.query(query).all(...params);

  return c.json({
    success: true,
    data: stories.map(formatStory),
  });
});

// Get single story
storyRoutes.get('/:id', (c) => {
  const story = db.query('SELECT * FROM stories WHERE id = ?').get(c.req.param('id'));
  if (!story) return c.json({ success: false, error: 'Not found' }, 404);

  // Include media
  const media = db.query('SELECT * FROM media WHERE story_id = ?').all(c.req.param('id'));
  const formatted = formatStory(story);
  formatted.media = media;

  return c.json({ success: true, data: formatted });
});

// Create story
storyRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const id = generateId();

  db.run(`
    INSERT INTO stories (id, assignment_id, headline, slug, body, summary, tags, status, filed_by, latitude, longitude, place_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, body.assignmentId || null, body.headline, body.slug || body.headline.toLowerCase().replace(/\s+/g, '-'),
    body.body || '', body.summary || null, JSON.stringify(body.tags || []),
    body.status || 'draft', body.filedBy || 'usr_005',
    body.location?.latitude || null, body.location?.longitude || null, body.location?.placeName || null,
  ]);

  const story = db.query('SELECT * FROM stories WHERE id = ?').get(id);
  return c.json({ success: true, data: formatStory(story) }, 201);
});

// Update story
storyRoutes.patch('/:id', async (c) => {
  const body = await c.req.json();
  const updates: string[] = [];
  const params: any[] = [];

  if (body.headline) { updates.push('headline = ?'); params.push(body.headline); }
  if (body.body !== undefined) { updates.push('body = ?'); params.push(body.body); }
  if (body.summary !== undefined) { updates.push('summary = ?'); params.push(body.summary); }
  if (body.status) {
    updates.push('status = ?'); params.push(body.status);
    if (body.status === 'filed') { updates.push('filed_at = datetime("now")'); }
  }
  if (body.tags) { updates.push('tags = ?'); params.push(JSON.stringify(body.tags)); }

  updates.push('updated_at = datetime("now")');
  params.push(c.req.param('id'));

  db.run(`UPDATE stories SET ${updates.join(', ')} WHERE id = ?`, params);
  const story = db.query('SELECT * FROM stories WHERE id = ?').get(c.req.param('id'));
  return c.json({ success: true, data: formatStory(story) });
});

function formatStory(row: any): any {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    headline: row.headline,
    slug: row.slug,
    body: row.body,
    summary: row.summary,
    tags: JSON.parse(row.tags || '[]'),
    location: row.latitude ? { latitude: row.latitude, longitude: row.longitude, placeName: row.place_name } : undefined,
    status: row.status,
    filedBy: row.filed_by,
    filedAt: row.filed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    media: [],
  };
}
