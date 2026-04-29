import { Hono } from 'hono';
import { db, generateId } from '../db/database';
import path from 'path';
import fs from 'fs/promises';

const uploadRoot = path.join(import.meta.dir, '../../uploads');
const publicUploadPrefix = '/media/uploads';

function cleanFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'upload.bin';
}

function mediaTypeFromMime(mimeType: string) {
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

export const mediaRoutes = new Hono();

mediaRoutes.get('/', (c) => {
  const storyId = c.req.query('storyId');
  const query = storyId
    ? db.query('SELECT * FROM media WHERE story_id = ? ORDER BY created_at DESC').all(storyId)
    : db.query('SELECT * FROM media ORDER BY created_at DESC LIMIT 50').all();
  return c.json({ success: true, data: query });
});

mediaRoutes.post('/upload', async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;

  if (!(file instanceof File)) {
    return c.json({ success: false, error: 'A multipart file field named "file" is required.' }, 400);
  }

  const id = generateId();
  const storyId = typeof body.storyId === 'string' && body.storyId.trim().length > 0 ? body.storyId : null;
  const mimeType = file.type || (typeof body.mimeType === 'string' ? body.mimeType : 'application/octet-stream');
  const type = typeof body.type === 'string' && body.type.length > 0 ? body.type : mediaTypeFromMime(mimeType);
  const originalFilename = typeof body.filename === 'string' && body.filename.length > 0 ? body.filename : file.name || 'upload.bin';
  const filename = `${id}-${cleanFilename(originalFilename)}`;
  const relativePath = storyId ? path.join(storyId, filename) : filename;
  const storagePath = path.join(uploadRoot, relativePath);
  const publicPath = `${publicUploadPrefix}/${relativePath.split(path.sep).join('/')}`;

  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  await Bun.write(storagePath, file);

  const sizeBytes = file.size || Number(body.sizeBytes || 0);

  try {
    db.run(`
    INSERT INTO media (id, story_id, type, uri, filename, mime_type, size_bytes, duration_ms, width, height, caption, latitude, longitude, captured_at, upload_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, storyId, type, publicPath, originalFilename, mimeType, sizeBytes,
    Number(body.durationMs || 0) || null, Number(body.width || 0) || null, Number(body.height || 0) || null,
    typeof body.caption === 'string' ? body.caption : null,
    Number(body.latitude || 0) || null, Number(body.longitude || 0) || null,
    typeof body.capturedAt === 'string' ? body.capturedAt : new Date().toISOString(),
    'uploaded',
  ]);
  } catch (err) {
    await fs.rm(storagePath, { force: true });
    throw err;
  }

  return c.json({
    success: true,
    data: {
      id,
      storyId,
      type,
      uri: publicPath,
      url: publicPath,
      filename: originalFilename,
      mimeType,
      sizeBytes,
      uploadStatus: 'uploaded',
    },
  }, 201);
});
