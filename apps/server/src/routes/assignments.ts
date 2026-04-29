import { Hono } from 'hono';
import { db } from '../db/database';

export const assignmentRoutes = new Hono();

// List assignments (for current user)
assignmentRoutes.get('/', (c) => {
  const userId = c.req.query('userId') || 'usr_005';
  const status = c.req.query('status');

  let query = 'SELECT * FROM assignments WHERE assigned_to = ?';
  const params: any[] = [userId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY CASE priority WHEN "breaking" THEN 0 WHEN "urgent" THEN 1 WHEN "standard" THEN 2 WHEN "feature" THEN 3 END, created_at DESC';

  const assignments = db.query(query).all(...params);

  return c.json({
    success: true,
    data: assignments.map(formatAssignment),
    meta: { total: assignments.length }
  });
});


// Create assignment (editor/admin)
assignmentRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();

  if (!title || !description) {
    return c.json({ success: false, error: 'title and description are required' }, 400);
  }

  const slug = String(body.slug || title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || id;

  const tags = Array.isArray(body.tags) ? JSON.stringify(body.tags) : JSON.stringify([]);

  db.query(`
    INSERT INTO assignments (
      id, title, slug, description, priority, status, assigned_to, assigned_by, bureau,
      latitude, longitude, place_name, deadline, tags, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    slug,
    description,
    body.priority || 'standard',
    body.status || 'assigned',
    body.assignedTo || body.assigned_to || null,
    body.assignedBy || body.assigned_by || 'usr_002',
    body.bureau || 'Doha',
    body.latitude ?? null,
    body.longitude ?? null,
    body.placeName || body.place_name || null,
    body.deadline || null,
    tags,
    now,
    now
  );

  const assignment = db.query('SELECT * FROM assignments WHERE id = ?').get(id);
  return c.json({ success: true, data: formatAssignment(assignment) }, 201);
});

// Get single assignment
assignmentRoutes.get('/:id', (c) => {
  const assignment = db.query('SELECT * FROM assignments WHERE id = ?').get(c.req.param('id'));
  if (!assignment) return c.json({ success: false, error: 'Not found' }, 404);
  return c.json({ success: true, data: formatAssignment(assignment) });
});

// Update assignment status
assignmentRoutes.patch('/:id', async (c) => {
  const { status } = await c.req.json();
  db.run('UPDATE assignments SET status = ?, updated_at = datetime("now") WHERE id = ?', [status, c.req.param('id')]);
  const updated = db.query('SELECT * FROM assignments WHERE id = ?').get(c.req.param('id'));
  return c.json({ success: true, data: formatAssignment(updated) });
});

function formatAssignment(row: any) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assigned_to,
    assignedBy: row.assigned_by,
    bureau: row.bureau,
    location: row.latitude ? { latitude: row.latitude, longitude: row.longitude, placeName: row.place_name } : undefined,
    deadline: row.deadline,
    tags: JSON.parse(row.tags || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
