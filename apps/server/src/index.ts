import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import path from 'path';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth';
import { assignmentRoutes } from './routes/assignments';
import { storyRoutes } from './routes/stories';
import { mediaRoutes } from './routes/media';
import { safetyRoutes } from './routes/safety';
import { syncRoutes } from './routes/sync';
import { aiRoutes } from './routes/ai';
import { seedDatabase } from './db/seed';

const app = new Hono();
const uploadRoot = path.join(import.meta.dir, '../uploads');

// Middleware
app.use('*', cors());
app.use('*', logger());
app.use('/api/media/uploads/*', serveStatic({
  root: uploadRoot,
  rewriteRequestPath: (requestPath) => requestPath.replace(/^\/api\/media\/uploads/, ''),
}));

// Health check
app.get('/', (c) => c.json({
  name: 'AJ Now API',
  version: '1.0.0',
  status: 'running',
  timestamp: new Date().toISOString(),
}));

// Routes
app.route('/api/auth', authRoutes);
app.route('/api/assignments', assignmentRoutes);
app.route('/api/stories', storyRoutes);
app.route('/api/media', mediaRoutes);
app.route('/api/safety', safetyRoutes);
app.route('/api/sync', syncRoutes);
app.route('/api/ai', aiRoutes);

// Seed on first run
seedDatabase();

console.log('🔵 AJ Now API running on http://localhost:3001');

export default {
  port: 3001,
  fetch: app.fetch,
};
