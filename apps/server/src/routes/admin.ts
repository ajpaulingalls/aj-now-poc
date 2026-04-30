import { Hono } from 'hono';
import { db } from '../db/database';


const authForm = (message = ''): string => `
  <div class="login-shell">
    <form class="card login-card" method="post" action="/admin/login">
      <p class="eyebrow">AJ Now Admin</p>
      <h1>Editor sign in</h1>
      <p class="muted">Local MVP guard for the newsroom dashboard. Use the shared editor passcode.</p>
      ${message ? `<p class="notice danger">${escapeHtml(message)}</p>` : ''}
      <label>Passcode
        <input type="password" name="passcode" autofocus required placeholder="Enter admin passcode" />
      </label>
      <button type="submit">Enter newsroom</button>
      <p class="muted tiny">Set <code>ADMIN_PASSCODE</code> to change it. Default for local development: <code>editor</code>.</p>
    </form>
  </div>
`;

export const adminRoutes = new Hono();

adminRoutes.get('/login', (c) => c.html(layout({ title: 'Editor sign in', active: 'login', body: authForm() })));

adminRoutes.post('/login', async (c) => {
  const body = await c.req.parseBody();
  if (String(body.passcode ?? '') !== adminPasscode()) {
    return c.html(layout({ title: 'Editor sign in', active: 'login', body: authForm('Incorrect passcode.') }));
  }
  c.header('Set-Cookie', `${ADMIN_COOKIE_NAME}=${ADMIN_COOKIE_VALUE}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=28800`);
  return c.redirect('/admin');
});

adminRoutes.get('/logout', (c) => {
  c.header('Set-Cookie', `${ADMIN_COOKIE_NAME}=; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=0`);
  return c.redirect('/admin/login');
});

adminRoutes.use('*', async (c, next) => {
  if (!isAdminAuthenticated(c)) {
    return c.redirect('/admin/login');
  }
  await next();
});

type DbRow = Record<string, any>;


const ADMIN_COOKIE_NAME = 'aj_now_admin';
const ADMIN_COOKIE_VALUE = 'local-editor';

const storyStatuses = [
  { value: 'draft', label: 'Draft' },
  { value: 'filed', label: 'Filed' },
  { value: 'changes_requested', label: 'Request changes' },
  { value: 'approved', label: 'Approved' },
  { value: 'published', label: 'Published' },
  { value: 'rejected', label: 'Rejected' }
];

const assignmentStatuses = [
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'filed', label: 'Filed' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' }
];

const isAdminAuthenticated = (c: any): boolean => {
  const cookie = c.req.header('cookie') ?? '';
  return cookie.split(';').map((part: string) => part.trim()).includes(`${ADMIN_COOKIE_NAME}=${ADMIN_COOKIE_VALUE}`);
};

const adminPasscode = (): string => process.env.ADMIN_PASSCODE || 'editor';

const statusOptions = (options: Array<{ value: string; label: string }>, current: unknown): string => options
  .map((option) => `<option value="${escapeHtml(option.value)}" ${String(current ?? '') === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`)
  .join('');

const statusActions = (options: Array<{ value: string; label: string }>, current: unknown): string => options
  .filter((option) => option.value !== current)
  .map((option) => `<button type="submit" name="status" value="${escapeHtml(option.value)}" class="secondary small ${option.value === 'rejected' ? 'danger-button' : ''}">${escapeHtml(option.label)}</button>`)
  .join('');

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const displayDate = (value: unknown): string => {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
};

const parseTags = (value: unknown): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return String(value).split(',').map((tag) => tag.trim()).filter(Boolean);
  }
};

const tags = (value: unknown): string => parseTags(value).map((tag) => badge(tag)).join(' ') || '—';

const userName = (id: unknown, users: DbRow[]): string => {
  const user = users.find((candidate) => candidate.id === id);
  return user ? `${user.name} (${user.bureau})` : String(id ?? 'Unassigned');
};

const layout = ({ title, active, body }: { title: string; active: string; body: string }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · AJ Now Newsroom</title>
  <style>
    :root { color-scheme: light; --bg:#f5f6f8; --panel:#fff; --ink:#14171a; --muted:#68707c; --line:#dfe3e8; --brand:#f4b400; --brand-dark:#a66f00; --danger:#c9352b; --ok:#1f8a4c; --info:#1f6feb; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:var(--bg); color:var(--ink); }
    a { color:var(--info); text-decoration:none; } a:hover { text-decoration:underline; }
    header { background:#101820; color:#fff; padding:18px 28px; display:flex; justify-content:space-between; align-items:center; gap:20px; }
    .brand { display:flex; align-items:center; gap:12px; font-weight:800; letter-spacing:.02em; }
    .mark { width:34px; height:34px; border-radius:9px; background:var(--brand); color:#111; display:grid; place-items:center; font-weight:900; }
    nav { display:flex; gap:6px; flex-wrap:wrap; }
    nav a { color:#d8dee9; padding:8px 11px; border-radius:999px; font-size:14px; }
    nav a.active, nav a:hover { background:#263443; color:#fff; text-decoration:none; }
    main { max-width:1280px; margin:0 auto; padding:28px; }
    .hero { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; margin-bottom:22px; }
    h1 { margin:0 0 6px; font-size:32px; line-height:1.1; }
    h2 { margin:0 0 16px; font-size:21px; }
    h3 { margin:0 0 10px; font-size:16px; }
    p { color:var(--muted); line-height:1.5; }
    .grid { display:grid; grid-template-columns: repeat(12, 1fr); gap:18px; }
    .card { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:18px; box-shadow:0 1px 2px rgba(16,24,32,.04); }
    .span-3 { grid-column: span 3; } .span-4 { grid-column: span 4; } .span-5 { grid-column: span 5; } .span-6 { grid-column: span 6; } .span-7 { grid-column: span 7; } .span-8 { grid-column: span 8; } .span-12 { grid-column: span 12; }
    .metric { font-size:34px; font-weight:850; margin:4px 0; }
    .muted { color:var(--muted); }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:16px; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    th, td { text-align:left; padding:11px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
    th { color:#4d5560; font-size:12px; text-transform:uppercase; letter-spacing:.04em; background:#fafbfc; }
    tr:hover td { background:#fafafa; }
    .badge { display:inline-block; padding:4px 9px; border-radius:999px; background:#eef2f7; color:#344054; font-size:12px; font-weight:700; white-space:nowrap; }
    .badge.breaking,.badge.urgent,.badge.panic { background:#ffe8e5; color:var(--danger); }
    .badge.standard,.badge.draft,.badge.pending { background:#eef2f7; color:#344054; }
    .badge.feature,.badge.filed,.badge.safe { background:#e9f7ef; color:var(--ok); }
    .badge.in_progress,.badge.assigned { background:#eaf2ff; color:var(--info); }
    .actions { display:flex; gap:8px; flex-wrap:wrap; }
    button, .button { border:0; background:#101820; color:#fff; padding:9px 12px; border-radius:10px; font-weight:750; cursor:pointer; display:inline-block; }
    button.secondary, .button.secondary { background:#eef2f7; color:#101820; }
    button.danger { background:var(--danger); }
    input, select, textarea { width:100%; border:1px solid #cfd6df; border-radius:10px; padding:10px 11px; font:inherit; background:#fff; }
    textarea { min-height:116px; resize:vertical; }
    label { display:block; font-weight:750; margin:0 0 6px; font-size:13px; color:#344054; }
    form .row { display:grid; grid-template-columns: repeat(12, 1fr); gap:14px; margin-bottom:14px; }
    .field-3 { grid-column:span 3; } .field-4 { grid-column:span 4; } .field-6 { grid-column:span 6; } .field-8 { grid-column:span 8; } .field-12 { grid-column:span 12; }
    .notice { padding:11px 13px; border-radius:12px; margin-bottom:16px; background:#e9f7ef; color:#135b32; border:1px solid #bfe8cf; }
    .error { background:#ffe8e5; color:#8a211a; border-color:#ffc5be; }
    .media-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:14px; }
    .media-card { border:1px solid var(--line); border-radius:14px; overflow:hidden; background:#fff; }
    .media-preview { height:118px; background:#eef2f7; display:grid; place-items:center; color:#68707c; font-weight:800; }
    .media-card img, .media-card video { width:100%; height:118px; object-fit:cover; display:block; background:#000; }
    .media-body { padding:11px; font-size:13px; }
    .story-body { white-space:pre-wrap; line-height:1.6; background:#fafbfc; border:1px solid var(--line); padding:16px; border-radius:12px; }
    @media (max-width: 900px) { .span-3,.span-4,.span-5,.span-6,.span-7,.span-8 { grid-column:span 12; } header,.hero { flex-direction:column; align-items:flex-start; } main { padding:18px; } form .row { grid-template-columns:1fr; } .field-3,.field-4,.field-6,.field-8,.field-12 { grid-column:span 1; } }
  </style>
</head>
<body>
  <header>
    <div class="brand"><div class="mark">AJ</div><div><div>AJ Now</div><div style="font-size:12px;color:#aeb8c4;font-weight:600">Newsroom desk MVP</div></div></div>
    <nav>
      ${navLink('/admin', 'Dashboard', active === 'dashboard')}
      ${navLink('/admin/assignments', 'Assignments', active === 'assignments')}
      ${navLink('/admin/stories', 'Stories', active === 'stories')}
      ${navLink('/admin/media', 'Media', active === 'media')}
      ${navLink('/admin/safety', 'Safety', active === 'safety')}
    </nav>
  </header>
  <main>${body}</main>
</body>
</html>`;

const navLink = (href: string, text: string, selected: boolean) => `<a href="${href}" class="${selected ? 'active' : ''}">${text}</a>`;
const badge = (value: unknown) => `<span class="badge ${escapeHtml(String(value ?? '').replace(/\s+/g, '_'))}">${escapeHtml(value || '—')}</span>`;

const getUsers = (): DbRow[] => db.query('SELECT id, name, email, role, bureau FROM users ORDER BY role, name').all() as DbRow[];
const getAssignableUsers = (): DbRow[] => db.query('SELECT id, name, email, role, bureau FROM users ORDER BY CASE role WHEN "editor" THEN 0 ELSE 1 END, name').all() as DbRow[];

adminRoutes.get('/', (c) => {
  const counts = {
    assignments: (db.query('SELECT COUNT(*) AS count FROM assignments').get() as DbRow).count,
    pendingAssignments: (db.query('SELECT COUNT(*) AS count FROM assignments WHERE status IN ("pending", "assigned", "in_progress")').get() as DbRow).count,
    stories: (db.query('SELECT COUNT(*) AS count FROM stories').get() as DbRow).count,
    filedStories: (db.query('SELECT COUNT(*) AS count FROM stories WHERE status IN ("filed", "review", "draft")').get() as DbRow).count,
    media: (db.query('SELECT COUNT(*) AS count FROM media').get() as DbRow).count,
    safety: (db.query('SELECT COUNT(*) AS count FROM safety_checkins').get() as DbRow).count,
  };
  const users = getUsers();
  const assignments = db.query('SELECT * FROM assignments ORDER BY created_at DESC LIMIT 6').all() as DbRow[];
  const stories = db.query('SELECT * FROM stories ORDER BY updated_at DESC LIMIT 6').all() as DbRow[];
  const safety = db.query('SELECT sc.*, u.name AS user_name FROM safety_checkins sc LEFT JOIN users u ON u.id = sc.user_id ORDER BY timestamp DESC LIMIT 5').all() as DbRow[];

  return c.html(layout({ title: 'Dashboard', active: 'dashboard', body: `
    <section class="hero"><div><h1>Newsroom dashboard</h1><p>Manage assignments, review incoming stories, browse attachments, and monitor reporter safety.</p></div><a class="button" href="/admin/assignments">Create assignment</a></section>
    <section class="grid">
      ${metric('Assignments', counts.assignments, `${counts.pendingAssignments} active`, '/admin/assignments')}
      ${metric('Stories', counts.stories, `${counts.filedStories} awaiting desk attention`, '/admin/stories')}
      ${metric('Media files', counts.media, 'uploaded attachments', '/admin/media')}
      ${metric('Safety check-ins', counts.safety, 'latest reporter signals', '/admin/safety')}
      <div class="card span-6"><h2>Latest assignments</h2>${assignmentsTable(assignments, users, true)}</div>
      <div class="card span-6"><h2>Latest stories</h2>${storiesTable(stories, users, true)}</div>
      <div class="card span-12"><h2>Latest safety check-ins</h2>${safetyTable(safety)}</div>
    </section>` }));
});

adminRoutes.get('/assignments', (c) => {
  const notice = c.req.query('created')
    ? '<div class="notice">Assignment created and dispatched to the selected reporter.</div>'
    : c.req.query('updated')
      ? '<div class="notice">Assignment status updated.</div>'
      : '';
  const users = getAssignableUsers();
  const assignments = db.query('SELECT * FROM assignments ORDER BY CASE priority WHEN "breaking" THEN 0 WHEN "urgent" THEN 1 WHEN "standard" THEN 2 WHEN "feature" THEN 3 END, created_at DESC').all() as DbRow[];
  return c.html(layout({ title: 'Assignments', active: 'assignments', body: `
    <section class="hero"><div><h1>Assignments</h1><p>Create, route, and track newsroom assignments.</p></div></section>
    ${notice}
    <section class="grid">
      <div class="card span-4"><h2>Create assignment</h2>${assignmentForm(users)}</div>
      <div class="card span-8"><h2>Assignment board</h2>${assignmentsTable(assignments, users)}</div>
    </section>` }));
});

adminRoutes.post('/assignments', async (c) => {
  const body = await c.req.parseBody();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.query(`
    INSERT INTO assignments (id, title, slug, description, status, priority, assigned_to, assigned_by, bureau, place_name, latitude, longitude, deadline, tags, created_at, updated_at)
    VALUES ($id, $title, $slug, $description, $status, $priority, $assignedTo, $assignedBy, $bureau, $placeName, $latitude, $longitude, $deadline, $tags, $createdAt, $updatedAt)
  `).run({
    $id: id,
    $title: String(body.title || 'Untitled assignment'),
    $slug: (String(body.title || id).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || id),
    $description: String(body.description || ''),
    $status: String(body.status || 'assigned'),
    $priority: String(body.priority || 'standard'),
    $assignedTo: String(body.assignedTo || 'usr_001'),
    $assignedBy: 'usr_004',
    $bureau: String(body.bureau || 'Doha'),
    $placeName: String(body.placeName || ''),
    $latitude: body.latitude ? Number(body.latitude) : null,
    $longitude: body.longitude ? Number(body.longitude) : null,
    $deadline: body.deadline ? String(body.deadline) : null,
    $tags: JSON.stringify(String(body.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean)),
    $createdAt: now,
    $updatedAt: now
  });
  return c.redirect('/admin/assignments?created=1');
});

adminRoutes.post('/assignments/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.parseBody();
  const status = String(body.status || 'assigned');
  const allowed = new Set(assignmentStatuses.map((option) => option.value));
  if (!allowed.has(status)) {
    return c.text('Invalid assignment status', 400);
  }
  const result = db.query('UPDATE assignments SET status = $status, updated_at = $updatedAt WHERE id = $id').run({
    $id: id,
    $status: status,
    $updatedAt: new Date().toISOString()
  });
  if (result.changes === 0) return c.notFound();
  return c.redirect('/admin/assignments?updated=1');
});

adminRoutes.get('/stories', (c) => {
  const notice = c.req.query('updated') ? '<div class="notice">Story status updated.</div>' : '';
  const users = getAssignableUsers();
  const stories = db.query('SELECT * FROM stories ORDER BY updated_at DESC').all() as DbRow[];
  return c.html(layout({ title: 'Stories', active: 'stories', body: `
    <section class="hero"><div><h1>Story review</h1><p>Review incoming copy, request changes, approve, or publish.</p></div></section>
    ${notice}
    <div class="card">${storiesTable(stories, users)}</div>` }));
});

adminRoutes.get('/stories/:id', (c) => {
  const story = db.query('SELECT * FROM stories WHERE id = $id').get({ $id: c.req.param('id') }) as DbRow | null;
  if (!story) return c.notFound();
  const users = getAssignableUsers();
  const media = db.query('SELECT * FROM media WHERE story_id = $storyId ORDER BY created_at DESC').all({ $storyId: story.id }) as DbRow[];
  const assignment = story.assignment_id ? db.query('SELECT * FROM assignments WHERE id = $id').get({ $id: story.assignment_id }) as DbRow | null : null;
  const notice = c.req.query('updated') ? '<div class="notice">Story status updated.</div>' : '';
  return c.html(layout({ title: story.headline || 'Story detail', active: 'stories', body: `
    <section class="hero"><div><h1>${escapeHtml(story.headline || 'Untitled story')}</h1><p>${escapeHtml(story.summary || 'No summary yet.')}</p></div><span class="pill">${escapeHtml(story.status)}</span></section>
    ${notice}
    <section class="grid">
      <div class="card span-8">
        <h2>Copy</h2>
        <p class="muted">Filed by ${escapeHtml(userName(story.filed_by, users))} • Updated ${displayDate(story.updated_at)}</p>
        <article>${escapeHtml(story.body || '').replace(/\n/g, '<br>')}</article>
      </div>
      <div class="card span-4">
        <h2>Workflow</h2>
        ${storyWorkflow(story)}
        <h2>Metadata</h2>
        <p><strong>Status:</strong> ${escapeHtml(story.status)}</p>
        <p><strong>Reporter:</strong> ${escapeHtml(userName(story.filed_by, users))}</p>
        <p><strong>Assignment:</strong> ${assignment ? escapeHtml(assignment.title) : '—'}</p>
        <p><strong>Location:</strong> ${escapeHtml(story.place_name || '—')}</p>
        <p><strong>Tags:</strong> ${tags(story.tags)}</p>
        <p><strong>Filed:</strong> ${displayDate(story.filed_at)}</p>
      </div>
      <div class="card span-12"><h2>Attachments</h2>${mediaGrid(media)}</div>
    </section>` }));
});

adminRoutes.post('/stories/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.parseBody();
  const status = String(body.status || 'filed');
  const allowed = new Set(storyStatuses.map((option) => option.value));
  if (!allowed.has(status)) {
    return c.text('Invalid story status', 400);
  }
  const result = db.query('UPDATE stories SET status = $status, updated_at = $updatedAt WHERE id = $id').run({
    $id: id,
    $status: status,
    $updatedAt: new Date().toISOString()
  });
  if (result.changes === 0) return c.notFound();
  return c.redirect(`/admin/stories/${encodeURIComponent(id)}?updated=1`);
});

adminRoutes.get('/media', (c) => {
  const media = db.query('SELECT m.*, s.headline FROM media m LEFT JOIN stories s ON s.id = m.story_id ORDER BY m.created_at DESC').all() as DbRow[];
  return c.html(layout({ title: 'Media', active: 'media', body: `
    <section class="hero"><div><h1>Media library</h1><p>Browse uploaded story attachments from reporters.</p></div></section>
    <div class="card">${mediaGrid(media)}</div>` }));
});

adminRoutes.get('/safety', (c) => {
  const rows = db.query('SELECT sc.*, u.name AS user_name, u.bureau FROM safety_checkins sc LEFT JOIN users u ON u.id = sc.user_id ORDER BY timestamp DESC').all() as DbRow[];
  return c.html(layout({ title: 'Safety', active: 'safety', body: `
    <section class="hero"><div><h1>Safety monitor</h1><p>Latest reporter check-ins and panic signals.</p></div></section>
    <div class="card">${safetyTable(rows)}</div>` }));
});

const metric = (title: string, value: unknown, subtext: string, href: string) => `
  <a class="card span-3" href="${href}" style="color:inherit;text-decoration:none"><div class="muted">${escapeHtml(title)}</div><div class="metric">${escapeHtml(value)}</div><div class="muted">${escapeHtml(subtext)}</div></a>`;

const assignmentStatusControl = (assignment: DbRow): string => `
  <form class="inline-form" method="post" action="/admin/assignments/${encodeURIComponent(String(assignment.id))}/status">
    <select name="status" aria-label="Assignment status">${statusOptions(assignmentStatuses, assignment.status)}</select>
    <button class="secondary small" type="submit">Update</button>
  </form>`;

const assignmentsTable = (assignments: DbRow[], users: DbRow[], compact = false): string => {
  if (!assignments.length) return '<p>No assignments yet.</p>';
  return `<table><thead><tr><th>Assignment</th><th>Priority</th><th>Status</th><th>Reporter</th>${compact ? '' : '<th>Deadline</th><th>Controls</th>'}</tr></thead><tbody>${assignments.map((assignment) => `
    <tr><td><strong>${escapeHtml(assignment.title)}</strong><br><span class="muted">${escapeHtml(assignment.place_name || assignment.bureau || '')}</span></td><td>${badge(assignment.priority)}</td><td>${badge(assignment.status)}</td><td>${escapeHtml(userName(assignment.assigned_to, users))}</td>${compact ? '' : `<td>${displayDate(assignment.deadline)}</td><td>${assignmentStatusControl(assignment)}</td>`}</tr>`).join('')}</tbody></table>`;
};

const storyQuickStatusControl = (story: DbRow): string => `
  <form class="inline-form" method="post" action="/admin/stories/${encodeURIComponent(String(story.id))}/status">
    <select name="status" aria-label="Story status">${statusOptions(storyStatuses, story.status)}</select>
    <button class="secondary small" type="submit">Update</button>
  </form>`;

const storiesTable = (stories: DbRow[], users: DbRow[], compact = false): string => {
  if (!stories.length) return '<p>No stories yet.</p>';
  return `<table><thead><tr><th>Story</th><th>Status</th><th>Reporter</th>${compact ? '' : '<th>Updated</th><th>Controls</th>'}</tr></thead><tbody>${stories.map((story) => `
    <tr><td><a href="/admin/stories/${encodeURIComponent(String(story.id))}"><strong>${escapeHtml(story.headline || 'Untitled story')}</strong></a><br><span class="muted">${escapeHtml(story.summary || story.place_name || '')}</span></td><td>${badge(story.status)}</td><td>${escapeHtml(userName(story.filed_by, users))}</td>${compact ? '' : `<td>${displayDate(story.updated_at)}</td><td>${storyQuickStatusControl(story)}</td>`}</tr>`).join('')}</tbody></table>`;
};

const safetyTable = (rows: DbRow[]): string => {
  if (!rows.length) return '<p>No safety check-ins yet.</p>';
  return `<table><thead><tr><th>Reporter</th><th>Status</th><th>Message</th><th>Location</th><th>Time</th></tr></thead><tbody>${rows.map((row) => `
    <tr><td><strong>${escapeHtml(row.user_name || row.user_id)}</strong><br><span class="muted">${escapeHtml(row.bureau || '')}</span></td><td>${badge(row.status)}</td><td>${escapeHtml(row.message || '—')}</td><td>${row.latitude && row.longitude ? `${escapeHtml(row.latitude)}, ${escapeHtml(row.longitude)}` : '—'}</td><td>${displayDate(row.timestamp)}</td></tr>`).join('')}</tbody></table>`;
};

const mediaIcon = (item: DbRow): string => {
  const mime = String(item.mime_type || '').toLowerCase();
  const type = String(item.type || '').toLowerCase();
  if (type === 'audio' || mime.startsWith('audio/')) return '🎧';
  if (type === 'document' || mime.includes('pdf') || mime.includes('text')) return '📄';
  return '📎';
};

const mediaGrid = (media: DbRow[]): string => {
  if (!media.length) return '<p>No uploaded media for this view yet.</p>';
  return `<div class="media-grid">${media.map((item) => {
    const url = item.url || item.uri || '';
    const src = url.startsWith('/api/') ? url : url.startsWith('/media/') ? `/api${url}` : url;
    const type = String(item.type || '').toLowerCase();
    const mime = String(item.mime_type || '').toLowerCase();
    const preview = type === 'photo' || mime.startsWith('image/')
      ? `<div class="media-preview"><img src="${escapeHtml(src)}" alt="${escapeHtml(item.caption || item.filename || 'Uploaded image')}" /></div>`
      : type === 'video' || mime.startsWith('video/')
        ? `<div class="media-preview"><video src="${escapeHtml(src)}" controls></video></div>`
        : type === 'audio' || mime.startsWith('audio/')
          ? `<div class="media-preview"><audio src="${escapeHtml(src)}" controls></audio></div>`
          : `<div class="media-preview"><span class="media-icon">${mediaIcon(item)}</span></div>`;
    return `<div class="media-card media-panel">${preview}<div class="media-body"><strong>${escapeHtml(item.filename || 'Attachment')}</strong><br>${badge(item.type)} ${badge(item.upload_status)}<p class="muted">${escapeHtml(item.caption || item.headline || '')}</p><p class="media-meta">${escapeHtml(item.mime_type || 'unknown type')} • ${escapeHtml(item.size_bytes || '—')} bytes • ${displayDate(item.created_at)}</p><a href="${escapeHtml(src)}" target="_blank" rel="noreferrer">Open file</a></div></div>`;
  }).join('')}</div>`;
};

const storyWorkflow = (story: DbRow): string => `
  <form method="post" action="/admin/stories/${encodeURIComponent(String(story.id))}/status">
    <label for="story-status">Set status</label>
    <select id="story-status" name="status">${statusOptions(storyStatuses, story.status)}</select>
    <button type="submit">Update story</button>
  </form>
  <div class="workflow" aria-label="Quick story actions">
    <form class="inline-form" method="post" action="/admin/stories/${encodeURIComponent(String(story.id))}/status">
      ${statusActions(storyStatuses.filter((option) => ['changes_requested', 'approved', 'published', 'rejected'].includes(option.value)), story.status)}
    </form>
  </div>`;

const assignmentForm = (users: DbRow[]): string => `<form method="post" action="/admin/assignments">
  <div class="row"><div class="field-12"><label for="title">Title</label><input id="title" name="title" required placeholder="e.g. Live update from Gaza crossing" /></div></div>
  <div class="row"><div class="field-12"><label for="description">Brief</label><textarea id="description" name="description" required placeholder="What should the reporter capture or file?"></textarea></div></div>
  <div class="row">
    <div class="field-6"><label for="assigned_to">Reporter</label><select id="assigned_to" name="assignedTo">${users.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} · ${escapeHtml(user.bureau)} · ${escapeHtml(user.role)}</option>`).join('')}</select></div>
    <div class="field-3"><label for="priority">Priority</label><select id="priority" name="priority"><option>standard</option><option>urgent</option><option>breaking</option><option>feature</option></select></div>
    <div class="field-3"><label for="status">Status</label><select id="status" name="status"><option>assigned</option><option>pending</option><option>accepted</option><option>in_progress</option></select></div>
  </div>
  <div class="row">
    <div class="field-4"><label for="bureau">Bureau</label><input id="bureau" name="bureau" value="Doha" /></div>
    <div class="field-4"><label for="place_name">Place</label><input id="place_name" name="placeName" placeholder="City, venue, area" /></div>
    <div class="field-4"><label for="deadline">Deadline</label><input id="deadline" name="deadline" type="datetime-local" /></div>
  </div>
  <div class="row">
    <div class="field-6"><label for="latitude">Latitude</label><input id="latitude" name="latitude" type="number" step="any" /></div>
    <div class="field-6"><label for="longitude">Longitude</label><input id="longitude" name="longitude" type="number" step="any" /></div>
  </div>
  <div class="row"><div class="field-12"><label for="tags">Tags</label><input id="tags" name="tags" placeholder="politics, live, breaking" /></div></div>
  <button type="submit">Create assignment</button>
</form>`;
