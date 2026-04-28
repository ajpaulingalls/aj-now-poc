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
