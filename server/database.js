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

  CREATE TABLE IF NOT EXISTS google_sheets_integrations (
    endpoint_id TEXT PRIMARY KEY,
    owner_user_id TEXT,
    is_enabled INTEGER DEFAULT 0,
    spreadsheet_id TEXT DEFAULT '',
    sheet_name TEXT DEFAULT 'Webhook Events',
    credentials_json TEXT DEFAULT '',
    last_synced_at TEXT,
    last_error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS endpoint_integrations (
    endpoint_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    owner_user_id TEXT,
    is_enabled INTEGER DEFAULT 0,
    config_json TEXT DEFAULT '{}',
    last_synced_at TEXT,
    last_error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (endpoint_id, provider),
    FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS email_inboxes (
    endpoint_id TEXT PRIMARY KEY,
    owner_user_id TEXT,
    is_enabled INTEGER DEFAULT 0,
    local_part TEXT UNIQUE NOT NULL,
    allow_plus_aliases INTEGER DEFAULT 1,
    reply_name TEXT DEFAULT '',
    last_email_at TEXT,
    last_error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT,
    endpoint_id TEXT NOT NULL,
    name TEXT DEFAULT '',
    description TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    conditions_json TEXT DEFAULT '{}',
    actions_json TEXT DEFAULT '[]',
    last_run_at TEXT,
    last_error TEXT,
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
  CREATE INDEX IF NOT EXISTS idx_google_sheets_owner_user_id ON google_sheets_integrations(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_google_sheets_enabled ON google_sheets_integrations(is_enabled);
  CREATE INDEX IF NOT EXISTS idx_endpoint_integrations_owner_user_id ON endpoint_integrations(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_endpoint_integrations_provider ON endpoint_integrations(provider);
  CREATE INDEX IF NOT EXISTS idx_endpoint_integrations_is_enabled ON endpoint_integrations(is_enabled);
  CREATE INDEX IF NOT EXISTS idx_email_inboxes_owner_user_id ON email_inboxes(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_email_inboxes_is_enabled ON email_inboxes(is_enabled);
  CREATE INDEX IF NOT EXISTS idx_email_inboxes_local_part ON email_inboxes(local_part);
  CREATE INDEX IF NOT EXISTS idx_workflows_endpoint_id ON workflows(endpoint_id);
  CREATE INDEX IF NOT EXISTS idx_workflows_owner_user_id ON workflows(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_workflows_is_active ON workflows(is_active);
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

    // Google Sheets integrations
    getGoogleSheetsIntegrationByEndpoint: db.prepare(`
    SELECT * FROM google_sheets_integrations WHERE endpoint_id = ?
  `),

    getGoogleSheetsIntegrationByEndpointForOwner: db.prepare(`
    SELECT * FROM google_sheets_integrations WHERE endpoint_id = ? AND owner_user_id = ?
  `),

    upsertGoogleSheetsIntegration: db.prepare(`
    INSERT INTO google_sheets_integrations (
      endpoint_id,
      owner_user_id,
      is_enabled,
      spreadsheet_id,
      sheet_name,
      credentials_json,
      last_error
    )
    VALUES (?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(endpoint_id) DO UPDATE SET
      owner_user_id = excluded.owner_user_id,
      is_enabled = excluded.is_enabled,
      spreadsheet_id = excluded.spreadsheet_id,
      sheet_name = excluded.sheet_name,
      credentials_json = excluded.credentials_json,
      last_error = NULL,
      updated_at = datetime('now')
  `),

    updateGoogleSheetsIntegrationStatus: db.prepare(`
    UPDATE google_sheets_integrations
    SET last_synced_at = ?, last_error = ?, updated_at = datetime('now')
    WHERE endpoint_id = ?
  `),

    deleteGoogleSheetsIntegrationByEndpoint: db.prepare(`
    DELETE FROM google_sheets_integrations WHERE endpoint_id = ?
  `),

    deleteGoogleSheetsIntegrationByEndpointForOwner: db.prepare(`
    DELETE FROM google_sheets_integrations WHERE endpoint_id IN (
      SELECT id
      FROM endpoints
      WHERE id = ? AND owner_user_id = ?
    )
  `),

    adoptUnownedGoogleSheetsIntegrations: db.prepare(`
    UPDATE google_sheets_integrations
    SET owner_user_id = ?, updated_at = datetime('now')
    WHERE owner_user_id IS NULL
  `),

    // Generic endpoint integrations
    getIntegrationsByEndpoint: db.prepare(`
    SELECT * FROM endpoint_integrations
    WHERE endpoint_id = ?
    ORDER BY provider ASC
  `),

    getIntegrationsByEndpointForOwner: db.prepare(`
    SELECT * FROM endpoint_integrations
    WHERE endpoint_id = ? AND owner_user_id = ?
    ORDER BY provider ASC
  `),

    getEnabledIntegrationsByEndpoint: db.prepare(`
    SELECT * FROM endpoint_integrations
    WHERE endpoint_id = ? AND is_enabled = 1
    ORDER BY provider ASC
  `),

    getIntegrationByEndpointAndProvider: db.prepare(`
    SELECT * FROM endpoint_integrations
    WHERE endpoint_id = ? AND provider = ?
  `),

    getIntegrationByEndpointAndProviderForOwner: db.prepare(`
    SELECT * FROM endpoint_integrations
    WHERE endpoint_id = ? AND provider = ? AND owner_user_id = ?
  `),

    upsertIntegration: db.prepare(`
    INSERT INTO endpoint_integrations (
      endpoint_id,
      provider,
      owner_user_id,
      is_enabled,
      config_json,
      last_error
    )
    VALUES (?, ?, ?, ?, ?, NULL)
    ON CONFLICT(endpoint_id, provider) DO UPDATE SET
      owner_user_id = excluded.owner_user_id,
      is_enabled = excluded.is_enabled,
      config_json = excluded.config_json,
      last_error = NULL,
      updated_at = datetime('now')
  `),

    updateIntegrationStatus: db.prepare(`
    UPDATE endpoint_integrations
    SET last_synced_at = ?, last_error = ?, updated_at = datetime('now')
    WHERE endpoint_id = ? AND provider = ?
  `),

    deleteIntegrationsByEndpoint: db.prepare(`
    DELETE FROM endpoint_integrations
    WHERE endpoint_id = ?
  `),

    deleteIntegrationsByEndpointForOwner: db.prepare(`
    DELETE FROM endpoint_integrations
    WHERE endpoint_id IN (
      SELECT id
      FROM endpoints
      WHERE id = ? AND owner_user_id = ?
    )
  `),

    adoptUnownedEndpointIntegrations: db.prepare(`
    UPDATE endpoint_integrations
    SET owner_user_id = ?, updated_at = datetime('now')
    WHERE owner_user_id IS NULL
  `),

    // Email inbox endpoints
    getEmailInboxByEndpoint: db.prepare(`
    SELECT * FROM email_inboxes WHERE endpoint_id = ?
  `),

    getEmailInboxByEndpointForOwner: db.prepare(`
    SELECT * FROM email_inboxes WHERE endpoint_id = ? AND owner_user_id = ?
  `),

    getEmailInboxByLocalPart: db.prepare(`
    SELECT * FROM email_inboxes WHERE local_part = ?
  `),

    upsertEmailInbox: db.prepare(`
    INSERT INTO email_inboxes (
      endpoint_id,
      owner_user_id,
      is_enabled,
      local_part,
      allow_plus_aliases,
      reply_name,
      last_error
    )
    VALUES (?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(endpoint_id) DO UPDATE SET
      owner_user_id = excluded.owner_user_id,
      is_enabled = excluded.is_enabled,
      local_part = excluded.local_part,
      allow_plus_aliases = excluded.allow_plus_aliases,
      reply_name = excluded.reply_name,
      last_error = NULL,
      updated_at = datetime('now')
  `),

    updateEmailInboxStatus: db.prepare(`
    UPDATE email_inboxes
    SET last_email_at = ?, last_error = ?, updated_at = datetime('now')
    WHERE endpoint_id = ?
  `),

    deleteEmailInboxByEndpoint: db.prepare(`
    DELETE FROM email_inboxes WHERE endpoint_id = ?
  `),

    deleteEmailInboxByEndpointForOwner: db.prepare(`
    DELETE FROM email_inboxes WHERE endpoint_id IN (
      SELECT id
      FROM endpoints
      WHERE id = ? AND owner_user_id = ?
    )
  `),

    adoptUnownedEmailInboxes: db.prepare(`
    UPDATE email_inboxes
    SET owner_user_id = ?, updated_at = datetime('now')
    WHERE owner_user_id IS NULL
  `),

    // Workflows
    createWorkflow: db.prepare(`
    INSERT INTO workflows (id, owner_user_id, endpoint_id, name, description, is_active, conditions_json, actions_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

    getWorkflow: db.prepare(`
    SELECT * FROM workflows WHERE id = ?
  `),

    getWorkflowByOwner: db.prepare(`
    SELECT * FROM workflows WHERE id = ? AND owner_user_id = ?
  `),

    getWorkflowsByEndpoint: db.prepare(`
    SELECT * FROM workflows WHERE endpoint_id = ? ORDER BY created_at DESC
  `),

    getWorkflowsByEndpointByOwner: db.prepare(`
    SELECT * FROM workflows WHERE endpoint_id = ? AND owner_user_id = ? ORDER BY created_at DESC
  `),

    getActiveWorkflowsByEndpoint: db.prepare(`
    SELECT * FROM workflows WHERE endpoint_id = ? AND is_active = 1 ORDER BY created_at ASC
  `),

    updateWorkflow: db.prepare(`
    UPDATE workflows
    SET name = ?, description = ?, is_active = ?, conditions_json = ?, actions_json = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

    updateWorkflowByOwner: db.prepare(`
    UPDATE workflows
    SET name = ?, description = ?, is_active = ?, conditions_json = ?, actions_json = ?, updated_at = datetime('now')
    WHERE id = ? AND owner_user_id = ?
  `),

    updateWorkflowRuntime: db.prepare(`
    UPDATE workflows
    SET last_run_at = ?, last_error = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

    deleteWorkflow: db.prepare(`
    DELETE FROM workflows WHERE id = ?
  `),

    deleteWorkflowByOwner: db.prepare(`
    DELETE FROM workflows WHERE id = ? AND owner_user_id = ?
  `),

    deleteWorkflowsByEndpoint: db.prepare(`
    DELETE FROM workflows WHERE endpoint_id = ?
  `),

    deleteWorkflowsByEndpointByOwner: db.prepare(`
    DELETE FROM workflows
    WHERE endpoint_id IN (
      SELECT id
      FROM endpoints
      WHERE id = ? AND owner_user_id = ?
    )
  `),

    adoptUnownedWorkflows: db.prepare(`
    UPDATE workflows
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
