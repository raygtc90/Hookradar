import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'hookradar.db');

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS endpoints (
    id TEXT PRIMARY KEY,
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
    updated_at TEXT DEFAULT (datetime('now'))
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

  CREATE INDEX IF NOT EXISTS idx_requests_endpoint_id ON requests(endpoint_id);
  CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at);
  CREATE INDEX IF NOT EXISTS idx_requests_method ON requests(method);
  CREATE INDEX IF NOT EXISTS idx_endpoints_slug ON endpoints(slug);
`);

// Add forwarding_url column if it doesn't exist (migration for existing DBs)
try {
    db.exec(`ALTER TABLE endpoints ADD COLUMN forwarding_url TEXT DEFAULT ''`);
} catch (e) {
    // Column already exists, ignore
}

// Prepared statements
const stmts = {
    // Endpoints
    createEndpoint: db.prepare(`
    INSERT INTO endpoints (id, slug, name, description, response_status, response_headers, response_body, response_delay)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

    getEndpoint: db.prepare(`SELECT * FROM endpoints WHERE id = ?`),

    getEndpointBySlug: db.prepare(`SELECT * FROM endpoints WHERE slug = ?`),

    getAllEndpoints: db.prepare(`
    SELECT e.*, COUNT(r.id) as request_count, MAX(r.created_at) as last_request_at
    FROM endpoints e
    LEFT JOIN requests r ON e.id = r.endpoint_id
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `),

    updateEndpoint: db.prepare(`
    UPDATE endpoints 
    SET name = ?, description = ?, response_status = ?, response_headers = ?, 
        response_body = ?, response_delay = ?, is_active = ?, forwarding_url = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

    deleteEndpoint: db.prepare(`DELETE FROM endpoints WHERE id = ?`),

    // Requests
    createRequest: db.prepare(`
    INSERT INTO requests (id, endpoint_id, method, path, headers, query_params, body, content_type, ip_address, user_agent, size, response_status, response_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

    getRequest: db.prepare(`SELECT * FROM requests WHERE id = ?`),

    getRequestsByEndpoint: db.prepare(`
    SELECT * FROM requests WHERE endpoint_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
  `),

    getRequestCount: db.prepare(`SELECT COUNT(*) as count FROM requests WHERE endpoint_id = ?`),

    deleteRequest: db.prepare(`DELETE FROM requests WHERE id = ?`),

    deleteRequestsByEndpoint: db.prepare(`DELETE FROM requests WHERE endpoint_id = ?`),

    // Stats
    getStats: db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM endpoints) as total_endpoints,
      (SELECT COUNT(*) FROM requests) as total_requests,
      (SELECT COUNT(*) FROM requests WHERE created_at >= datetime('now', '-24 hours')) as requests_today
  `)
};

export { db, stmts };
