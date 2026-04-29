import { Hono } from 'hono';
import { db } from '../db/database';

export const syncRoutes = new Hono();

type SyncItem = {
  id?: string;
  type?: string;
  payload?: Record<string, unknown>;
};

type SyncResult = {
  id?: string;
  type?: string;
  status: 'accepted' | 'rejected';
  serverId?: string;
  error?: string;
};

const nowIso = () => new Date().toISOString();

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function applyDraft(item: SyncItem) {
  const payload = item.payload || {};
  const id = asString(payload.id, item.id || `story_${Date.now()}`);
  const createdAt = asString(payload.createdAt, nowIso());
  const updatedAt = asString(payload.updatedAt, nowIso());
  const title = asString(payload.title, 'Untitled field draft');
  const body = asString(payload.body);
  const tags = Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === 'string') : [];

  if (!body.trim()) {
    throw new Error('Draft body is required.');
  }

  db.query(
    `INSERT OR REPLACE INTO stories (
      id, assignment_id, headline, summary, body, language, status, filed_by, tags, media_assets, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    asString(payload.assignmentId) || null,
    title,
    asString(payload.summary, body.slice(0, 160)),
    body,
    asString(payload.language, 'en'),
    asString(payload.status, 'draft'),
    asString(payload.authorId, asString(payload.filedBy, 'usr_005')),
    JSON.stringify(tags),
    JSON.stringify([]),
    createdAt,
    updatedAt
  );

  return id;
}

function applySafetyCheckIn(item: SyncItem) {
  const payload = item.payload || {};
  const location = (payload.location && typeof payload.location === 'object' ? payload.location : {}) as Record<string, unknown>;
  const id = asString(payload.id, item.id || `safe_${Date.now()}`);
  const timestamp = asString(payload.timestamp, nowIso());

  db.query(
    `INSERT OR REPLACE INTO safety_checkins (
      id, user_id, latitude, longitude, altitude, accuracy, status, message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    asString(payload.userId, 'usr_005'),
    asNumber(location.latitude, 0),
    asNumber(location.longitude, 0),
    typeof location.altitude === 'number' ? location.altitude : null,
    asNumber(location.accuracy, 50),
    asString(payload.status, 'safe'),
    asString(payload.message),
    timestamp
  );

  return id;
}

// Push sync items from device
syncRoutes.post('/push', async (c) => {
  const body = await c.req.json<{ items?: SyncItem[] }>();
  const items = Array.isArray(body.items) ? body.items : [];
  const results: SyncResult[] = [];

  for (const item of items) {
    try {
      if (item.type === 'draft') {
        results.push({ id: item.id, type: item.type, status: 'accepted', serverId: applyDraft(item) });
        continue;
      }

      if (item.type === 'safety_checkin') {
        results.push({ id: item.id, type: item.type, status: 'accepted', serverId: applySafetyCheckIn(item) });
        continue;
      }

      results.push({ id: item.id, type: item.type, status: 'rejected', error: `Unsupported sync item type: ${item.type || 'unknown'}` });
    } catch (err) {
      results.push({ id: item.id, type: item.type, status: 'rejected', error: err instanceof Error ? err.message : 'Unable to apply sync item.' });
    }
  }

  const accepted = results.filter((result) => result.status === 'accepted').length;
  const rejected = results.length - accepted;

  return c.json({
    success: true,
    data: {
      processed: accepted,
      accepted,
      rejected,
      total: items.length,
      results,
    },
  });
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
      syncedAt: nowIso(),
    },
  });
});
