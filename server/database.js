import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDbPath = path.join(__dirname, '..', 'hookradar.db');
const dbPath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : defaultDbPath;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    plan TEXT DEFAULT 'free',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS endpoints (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    description TEXT DEFAULT '',
    response_status INTEGER DEFAULT 200,
    response_headers TEXT DEFAULT '{"Content-Type": "application/json"}',
    response_body TEXT DEFAULT '{"success": true, "message": "Webhook received by HookRadar"}',
    response_delay INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    forwarding_url TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    endpoint_id TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT DEFAULT '/',
    headers TEXT DEFAULT '{}',
    query_params TEXT DEFAULT '{}',
    body TEXT DEFAULT '',
    content_type TEXT DEFAULT '',
    ip_address TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    size INTEGER DEFAULT 0,
    response_status INTEGER DEFAULT 200,
    response_time INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT,
    endpoint_id TEXT NOT NULL,
    name TEXT DEFAULT '',
    method TEXT DEFAULT 'POST',
    path TEXT DEFAULT '/',
    headers TEXT DEFAULT '{"Content-Type": "application/json"}',
    body TEXT DEFAULT '',
    interval_minutes INTEGER DEFAULT 5,
    is_active INTEGER DEFAULT 1,
    last_run_at TEXT,
    next_run_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
  );
`);

// Add forwarding_url column if it doesn't exist (migration for existing DBs)
try {
    db.exec(`ALTER TABLE endpoints ADD COLUMN forwarding_url TEXT DEFAULT ''`);
} catch {
    // Column already exists, ignore
}

try {
    db.exec(`ALTER TABLE endpoints ADD COLUMN owner_user_id TEXT`);
} catch {
    // Column already exists, ignore
}

// Create indexes after schema migrations so legacy databases can be upgraded safely.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_requests_endpoint_id ON requests(endpoint_id);
  CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at);
  CREATE INDEX IF NOT EXISTS idx_requests_method ON requests(method);
  CREATE INDEX IF NOT EXISTS idx_endpoints_slug ON endpoints(slug);
  CREATE INDEX IF NOT EXISTS idx_endpoints_owner_user_id ON endpoints(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_schedules_endpoint_id ON schedules(endpoint_id);
  CREATE INDEX IF NOT EXISTS idx_schedules_owner_user_id ON schedules(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_schedules_next_run_at ON schedules(next_run_at);
  CREATE INDEX IF NOT EXISTS idx_schedules_is_active ON schedules(is_active);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`);

// Prepared statements
const stmts = {
    // Users
    countUsers: db.prepare(`SELECT COUNT(*) as count FROM users`),

    createUser: db.prepare(`
    INSERT INTO users (id, email, name, password_hash, plan)
    VALUES (?, ?, ?, ?, ?)
  `),

    getUserByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),

    getUserById: db.prepare(`SELECT * FROM users WHERE id = ?`),

    // Sessions
    createSession: db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `),

    getSessionByTokenHash: db.prepare(`
    SELECT u.id, u.email, u.name, u.plan, u.created_at, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > datetime('now')
  `),

    deleteSessionByTokenHash: db.prepare(`DELETE FROM sessions WHERE token_hash = ?`),

    deleteExpiredSessions: db.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`),

    // Endpoints
    createEndpoint: db.prepare(`
    INSERT INTO endpoints (id, owner_user_id, slug, name, description, response_status, response_headers, response_body, response_delay)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

    getEndpoint: db.prepare(`SELECT * FROM endpoints WHERE id = ?`),

    getEndpointByOwner: db.prepare(`SELECT * FROM endpoints WHERE id = ? AND owner_user_id = ?`),

    getEndpointBySlug: db.prepare(`SELECT * FROM endpoints WHERE slug = ?`),

    getAllEndpoints: db.prepare(`
    SELECT e.*, COUNT(r.id) as request_count, MAX(r.created_at) as last_request_at
    FROM endpoints e
    LEFT JOIN requests r ON e.id = r.endpoint_id
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `),

    getAllEndpointsByOwner: db.prepare(`
    SELECT e.*, COUNT(r.id) as request_count, MAX(r.created_at) as last_request_at
    FROM endpoints e
    LEFT JOIN requests r ON e.id = r.endpoint_id
    WHERE e.owner_user_id = ?
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `),

    updateEndpoint: db.prepare(`
    UPDATE endpoints 
    SET name = ?, description = ?, response_status = ?, response_headers = ?, 
        response_body = ?, response_delay = ?, is_active = ?, forwarding_url = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

    updateEndpointByOwner: db.prepare(`
    UPDATE endpoints
    SET name = ?, description = ?, response_status = ?, response_headers = ?,
        response_body = ?, response_delay = ?, is_active = ?, forwarding_url = ?, updated_at = datetime('now')
    WHERE id = ? AND owner_user_id = ?
  `),

    deleteEndpoint: db.prepare(`DELETE FROM endpoints WHERE id = ?`),

    deleteEndpointByOwner: db.prepare(`DELETE FROM endpoints WHERE id = ? AND owner_user_id = ?`),

    adoptUnownedEndpoints: db.prepare(`
    UPDATE endpoints
    SET owner_user_id = ?, updated_at = datetime('now')
    WHERE owner_user_id IS NULL
  `),

    // Schedules
    createSchedule: db.prepare(`
    INSERT INTO schedules (id, owner_user_id, endpoint_id, name, method, path, headers, body, interval_minutes, is_active, next_run_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

    getSchedule: db.prepare(`SELECT * FROM schedules WHERE id = ?`),

    getScheduleByOwner: db.prepare(`SELECT * FROM schedules WHERE id = ? AND owner_user_id = ?`),

    getScheduleWithEndpoint: db.prepare(`
    SELECT s.*, e.slug, e.is_active as endpoint_is_active
    FROM schedules s
    JOIN endpoints e ON e.id = s.endpoint_id
    WHERE s.id = ?
  `),

    getScheduleWithEndpointByOwner: db.prepare(`
    SELECT s.*, e.slug, e.is_active as endpoint_is_active
    FROM schedules s
    JOIN endpoints e ON e.id = s.endpoint_id
    WHERE s.id = ? AND s.owner_user_id = ?
  `),

    getSchedulesByEndpoint: db.prepare(`
    SELECT * FROM schedules WHERE endpoint_id = ? ORDER BY created_at DESC
  `),

    getSchedulesByEndpointByOwner: db.prepare(`
    SELECT * FROM schedules WHERE endpoint_id = ? AND owner_user_id = ? ORDER BY created_at DESC
  `),

    updateSchedule: db.prepare(`
    UPDATE schedules
    SET name = ?, method = ?, path = ?, headers = ?, body = ?, interval_minutes = ?, is_active = ?, next_run_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

    updateScheduleByOwner: db.prepare(`
    UPDATE schedules
    SET name = ?, method = ?, path = ?, headers = ?, body = ?, interval_minutes = ?, is_active = ?, next_run_at = ?, updated_at = datetime('now')
    WHERE id = ? AND owner_user_id = ?
  `),

    updateScheduleRuntime: db.prepare(`
    UPDATE schedules
    SET last_run_at = ?, next_run_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

    deleteSchedule: db.prepare(`DELETE FROM schedules WHERE id = ?`),

    deleteScheduleByOwner: db.prepare(`DELETE FROM schedules WHERE id = ? AND owner_user_id = ?`),

    deleteSchedulesByEndpoint: db.prepare(`DELETE FROM schedules WHERE endpoint_id = ?`),

    deleteSchedulesByEndpointByOwner: db.prepare(`
    DELETE FROM schedules
    WHERE endpoint_id IN (
      SELECT id
      FROM endpoints
      WHERE id = ? AND owner_user_id = ?
    )
  `),

    getDueSchedules: db.prepare(`
    SELECT s.*, e.slug
    FROM schedules s
    JOIN endpoints e ON e.id = s.endpoint_id
    WHERE s.is_active = 1
      AND e.is_active = 1
      AND s.next_run_at IS NOT NULL
      AND s.next_run_at <= datetime('now')
    ORDER BY s.next_run_at ASC
    LIMIT 25
  `),

    adoptUnownedSchedules: db.prepare(`
    UPDATE schedules
    SET owner_user_id = ?, updated_at = datetime('now')
    WHERE owner_user_id IS NULL
  `),

    // Requests
    createRequest: db.prepare(`
    INSERT INTO requests (id, endpoint_id, method, path, headers, query_params, body, content_type, ip_address, user_agent, size, response_status, response_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

    getRequest: db.prepare(`SELECT * FROM requests WHERE id = ?`),

    getRequestByOwner: db.prepare(`
    SELECT r.*
    FROM requests r
    JOIN endpoints e ON e.id = r.endpoint_id
    WHERE r.id = ? AND e.owner_user_id = ?
  `),

    getRequestsByEndpoint: db.prepare(`
    SELECT * FROM requests WHERE endpoint_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
  `),

    getRequestsByEndpointForExport: db.prepare(`
    SELECT * FROM requests WHERE endpoint_id = ? ORDER BY created_at DESC
  `),

    getRequestCount: db.prepare(`SELECT COUNT(*) as count FROM requests WHERE endpoint_id = ?`),

    deleteRequest: db.prepare(`DELETE FROM requests WHERE id = ?`),

    deleteRequestByOwner: db.prepare(`
    DELETE FROM requests
    WHERE id IN (
      SELECT r.id
      FROM requests r
      JOIN endpoints e ON e.id = r.endpoint_id
      WHERE r.id = ? AND e.owner_user_id = ?
    )
  `),

    deleteRequestsByEndpoint: db.prepare(`DELETE FROM requests WHERE endpoint_id = ?`),

    deleteRequestsByEndpointByOwner: db.prepare(`
    DELETE FROM requests
    WHERE endpoint_id IN (
      SELECT id
      FROM endpoints
      WHERE id = ? AND owner_user_id = ?
    )
  `),

    // Stats
    getStats: db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM endpoints) as total_endpoints,
      (SELECT COUNT(*) FROM requests) as total_requests,
      (SELECT COUNT(*) FROM requests WHERE created_at >= datetime('now', '-24 hours')) as requests_today
  `),

    getStatsByOwner: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM endpoints WHERE owner_user_id = ?) as total_endpoints,
      (
        SELECT COUNT(*)
        FROM requests r
        JOIN endpoints e ON e.id = r.endpoint_id
        WHERE e.owner_user_id = ?
      ) as total_requests,
      (
        SELECT COUNT(*)
        FROM requests r
        JOIN endpoints e ON e.id = r.endpoint_id
        WHERE e.owner_user_id = ? AND r.created_at >= datetime('now', '-24 hours')
      ) as requests_today
  `)
};

export { db, stmts };
