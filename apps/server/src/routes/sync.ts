import { Hono } from 'hono';
import { db } from '../db/database';

export const syncRoutes = new Hono();

// Push sync items from device
syncRoutes.post('/push', async (c) => {
  const { items } = await c.req.json();
  let processed = 0;
  
  for (const item of items) {
    // Process each sync item
    try {
      // In a real app, this would apply changes to the respective tables
      processed++;
    } catch (err) {
      console.error('Sync error:', err);
    }
  }
  
  return c.json({ success: true, data: { processed, total: items.length } });
});

// Pull updates since timestamp
syncRoutes.get('/pull', (c) => {
  const since = c.req.query('since') || '1970-01-01T00:00:00Z';
  const userId = c.req.query('userId') || 'usr_005';
  
  const assignments = db.query('SELECT * FROM assignments WHERE assigned_to = ? AND updated_at > ?').all(userId, since);
  const stories = db.query('SELECT * FROM stories WHERE filed_by = ? AND updated_at > ?').all(userId, since);
  
  return c.json({
    success: true,
    data: {
      assignments,
      stories,
      syncedAt: new Date().toISOString(),
    }
  });
});
