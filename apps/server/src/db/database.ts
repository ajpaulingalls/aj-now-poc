import { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(import.meta.dir, '../../data/aj-now.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'correspondent',
    bureau TEXT NOT NULL DEFAULT 'Doha',
    avatar_url TEXT,
    phone TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_relationship TEXT,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'standard',
    status TEXT NOT NULL DEFAULT 'pending',
    assigned_to TEXT NOT NULL,
    assigned_by TEXT NOT NULL,
    bureau TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    place_name TEXT,
    deadline TEXT,
    tags TEXT DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (assigned_to) REFERENCES users(id),
    FOREIGN KEY (assigned_by) REFERENCES users(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    assignment_id TEXT,
    headline TEXT NOT NULL,
    slug TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    summary TEXT,
    tags TEXT DEFAULT '[]',
    latitude REAL,
    longitude REAL,
    place_name TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    filed_by TEXT NOT NULL,
    filed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (assignment_id) REFERENCES assignments(id),
    FOREIGN KEY (filed_by) REFERENCES users(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    story_id TEXT,
    type TEXT NOT NULL,
    uri TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    width INTEGER,
    height INTEGER,
    caption TEXT,
    latitude REAL,
    longitude REAL,
    captured_at TEXT NOT NULL DEFAULT (datetime('now')),
    upload_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (story_id) REFERENCES stories(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS safety_checkins (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude REAL,
    accuracy REAL,
    status TEXT NOT NULL DEFAULT 'safe',
    message TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_attempt TEXT,
    error TEXT
  )
`);

console.log('📦 Database initialized.');

export function generateId(): string {
  return crypto.randomUUID();
}
