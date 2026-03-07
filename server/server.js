import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import { v4 as uuidv4 } from 'uuid';
import { db, stmts } from './database.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ limit: '10mb', type: 'text/*' }));
app.use(express.raw({ limit: '10mb', type: ['application/octet-stream', 'application/xml', 'application/x-www-form-urlencoded'] }));

// Create HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

// Track connected clients by endpoint
const clients = new Map();

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const endpointId = url.searchParams.get('endpointId');

    if (endpointId) {
        if (!clients.has(endpointId)) {
            clients.set(endpointId, new Set());
        }
        clients.get(endpointId).add(ws);

        ws.on('close', () => {
            const clientSet = clients.get(endpointId);
            if (clientSet) {
                clientSet.delete(ws);
                if (clientSet.size === 0) {
                    clients.delete(endpointId);
                }
            }
        });
    }

    // Also track global listeners
    if (!clients.has('__global__')) {
        clients.set('__global__', new Set());
    }
    clients.get('__global__').add(ws);

    ws.on('close', () => {
        const globalSet = clients.get('__global__');
        if (globalSet) {
            globalSet.delete(ws);
        }
    });
});

function broadcastToEndpoint(endpointId, data) {
    const message = JSON.stringify(data);

    // Send to endpoint-specific listeners
    const endpointClients = clients.get(endpointId);
    if (endpointClients) {
        endpointClients.forEach(ws => {
            if (ws.readyState === ws.OPEN) {
                ws.send(message);
            }
        });
    }

    // Send to global listeners
    const globalClients = clients.get('__global__');
    if (globalClients) {
        globalClients.forEach(ws => {
            if (ws.readyState === ws.OPEN) {
                ws.send(message);
            }
        });
    }
}

// ==================== API Routes ====================

// Get all endpoints
app.get('/api/endpoints', (req, res) => {
    try {
        const endpoints = stmts.getAllEndpoints.all();
        res.json({ success: true, data: endpoints });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Create a new endpoint
app.post('/api/endpoints', (req, res) => {
    try {
        const id = uuidv4();
        const slug = nanoid(10);
        const { name = '', description = '', response_status = 200, response_headers, response_body, response_delay = 0 } = req.body;

        const headers = response_headers || JSON.stringify({ 'Content-Type': 'application/json' });
        const body = response_body || JSON.stringify({ success: true, message: 'Webhook received by HookRadar' });

        stmts.createEndpoint.run(id, slug, name, description, response_status, headers, body, response_delay);

        const endpoint = stmts.getEndpoint.get(id);
        res.status(201).json({ success: true, data: endpoint });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get a single endpoint
app.get('/api/endpoints/:id', (req, res) => {
    try {
        const endpoint = stmts.getEndpoint.get(req.params.id);
        if (!endpoint) return res.status(404).json({ success: false, error: 'Endpoint not found' });
        res.json({ success: true, data: endpoint });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update endpoint
app.put('/api/endpoints/:id', (req, res) => {
    try {
        const existing = stmts.getEndpoint.get(req.params.id);
        if (!existing) return res.status(404).json({ success: false, error: 'Endpoint not found' });

        const {
            name = existing.name,
            description = existing.description,
            response_status = existing.response_status,
            response_headers = existing.response_headers,
            response_body = existing.response_body,
            response_delay = existing.response_delay,
            is_active = existing.is_active,
            forwarding_url = existing.forwarding_url || ''
        } = req.body;

        stmts.updateEndpoint.run(name, description, response_status, response_headers, response_body, response_delay, is_active, forwarding_url, req.params.id);

        const updated = stmts.getEndpoint.get(req.params.id);
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete endpoint
app.delete('/api/endpoints/:id', (req, res) => {
    try {
        stmts.deleteRequestsByEndpoint.run(req.params.id);
        stmts.deleteEndpoint.run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get requests for an endpoint (with advanced filtering)
app.get('/api/endpoints/:id/requests', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const { method, status, content_type, date_from, date_to, search } = req.query;

        // Build dynamic SQL for filtering
        let conditions = ['endpoint_id = ?'];
        let params = [req.params.id];

        if (method) {
            conditions.push('method = ?');
            params.push(method.toUpperCase());
        }

        if (status) {
            const statusNum = parseInt(status);
            if (statusNum >= 100 && statusNum < 200) {
                conditions.push('response_status >= 100 AND response_status < 200');
            } else if (statusNum >= 200 && statusNum < 300) {
                conditions.push('response_status >= 200 AND response_status < 300');
            } else if (statusNum >= 300 && statusNum < 400) {
                conditions.push('response_status >= 300 AND response_status < 400');
            } else if (statusNum >= 400 && statusNum < 500) {
                conditions.push('response_status >= 400 AND response_status < 500');
            } else if (statusNum >= 500) {
                conditions.push('response_status >= 500');
            }
        }

        if (content_type) {
            conditions.push('content_type LIKE ?');
            params.push(`%${content_type}%`);
        }

        if (date_from) {
            conditions.push("created_at >= ?");
            params.push(date_from);
        }

        if (date_to) {
            conditions.push("created_at <= ?");
            params.push(date_to);
        }

        if (search) {
            conditions.push('(method LIKE ? OR path LIKE ? OR body LIKE ?)');
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        const whereClause = conditions.join(' AND ');
        const dataQuery = db.prepare(`SELECT * FROM requests WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`);
        const countQuery = db.prepare(`SELECT COUNT(*) as count FROM requests WHERE ${whereClause}`);

        const requests = dataQuery.all(...params, limit, offset);
        const countResult = countQuery.get(...params);

        res.json({
            success: true,
            data: requests,
            total: countResult.count,
            limit,
            offset
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete a specific request
app.delete('/api/requests/:id', (req, res) => {
    try {
        stmts.deleteRequest.run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Clear all requests for an endpoint
app.delete('/api/endpoints/:id/requests', (req, res) => {
    try {
        stmts.deleteRequestsByEndpoint.run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get stats
app.get('/api/stats', (req, res) => {
    try {
        const stats = stmts.getStats.get();
        res.json({ success: true, data: stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Forward/Replay request
app.post('/api/requests/:id/replay', async (req, res) => {
    try {
        const request = stmts.getRequest.get(req.params.id);
        if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

        const { target_url } = req.body;
        if (!target_url) return res.status(400).json({ success: false, error: 'target_url is required' });

        const headers = JSON.parse(request.headers);
        // Remove host-specific headers
        delete headers.host;
        delete headers['content-length'];

        const response = await fetch(target_url, {
            method: request.method,
            headers: headers,
            body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body
        });

        const responseBody = await response.text();

        res.json({
            success: true,
            data: {
                status: response.status,
                headers: Object.fromEntries(response.headers.entries()),
                body: responseBody
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Analyze a request (AI-powered)
app.get('/api/requests/:id/analyze', (req, res) => {
    try {
        const request = stmts.getRequest.get(req.params.id);
        if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
        // Return the request data for frontend analysis
        res.json({ success: true, data: request });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get pattern analysis for an endpoint
app.get('/api/endpoints/:id/analysis', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const requests = stmts.getRequestsByEndpoint.all(req.params.id, limit, 0);
        res.json({ success: true, data: requests });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Handle all webhook requests
const webhookHandler = async (req, res) => {
    const slug = req.params.slug;
    const subpath = req.params[0] || '/';

    try {
        const endpoint = stmts.getEndpointBySlug.get(slug);
        if (!endpoint) {
            return res.status(404).json({ error: 'Webhook endpoint not found' });
        }

        if (!endpoint.is_active) {
            return res.status(410).json({ error: 'Webhook endpoint is inactive' });
        }

        const startTime = Date.now();

        // Parse body
        let body = '';
        if (req.body) {
            if (Buffer.isBuffer(req.body)) {
                body = req.body.toString('utf-8');
            } else if (typeof req.body === 'string') {
                body = req.body;
            } else {
                body = JSON.stringify(req.body);
            }
        }

        // Simulate response delay
        if (endpoint.response_delay > 0) {
            await new Promise(resolve => setTimeout(resolve, endpoint.response_delay));
        }

        const responseTime = Date.now() - startTime;

        // Store the request
        const requestId = uuidv4();
        const headers = JSON.stringify(req.headers);
        const queryParams = JSON.stringify(req.query);
        const contentType = req.headers['content-type'] || '';
        const ipAddress = req.ip || req.connection.remoteAddress || '';
        const userAgent = req.headers['user-agent'] || '';
        const size = Buffer.byteLength(body, 'utf8');

        stmts.createRequest.run(
            requestId, endpoint.id, req.method, subpath, headers, queryParams,
            body, contentType, ipAddress, userAgent, size, endpoint.response_status, responseTime
        );

        // Get the saved request
        const savedRequest = stmts.getRequest.get(requestId);

        // Broadcast to WebSocket clients
        broadcastToEndpoint(endpoint.id, {
            type: 'new_request',
            endpoint_id: endpoint.id,
            request: savedRequest
        });

        // Auto-forward to configured URL (fire-and-forget)
        if (endpoint.forwarding_url) {
            try {
                const forwardHeaders = { ...req.headers };
                delete forwardHeaders['host'];
                delete forwardHeaders['content-length'];

                fetch(endpoint.forwarding_url, {
                    method: req.method,
                    headers: forwardHeaders,
                    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
                }).then(fwdRes => {
                    console.log(`📤 Forwarded ${req.method} to ${endpoint.forwarding_url} → ${fwdRes.status}`);
                    // Broadcast forwarding result
                    broadcastToEndpoint(endpoint.id, {
                        type: 'forward_result',
                        request_id: requestId,
                        status: fwdRes.status,
                        url: endpoint.forwarding_url
                    });
                }).catch(fwdErr => {
                    console.error(`📤 Forward failed to ${endpoint.forwarding_url}:`, fwdErr.message);
                    broadcastToEndpoint(endpoint.id, {
                        type: 'forward_error',
                        request_id: requestId,
                        error: fwdErr.message,
                        url: endpoint.forwarding_url
                    });
                });
            } catch (fwdErr) {
                console.error('Forward setup error:', fwdErr.message);
            }
        }

        // Send configured response
        const responseHeaders = JSON.parse(endpoint.response_headers);
        Object.entries(responseHeaders).forEach(([key, value]) => {
            res.setHeader(key, value);
        });

        res.status(endpoint.response_status).send(endpoint.response_body);
    } catch (err) {
        console.error('Webhook handler error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Catch all HTTP methods for webhook endpoints
app.all('/hook/:slug', webhookHandler);
app.all('/hook/:slug/*', webhookHandler);

// Serve static frontend in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');

if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('📦 Serving static frontend from /dist');
}

// Start server
server.listen(PORT, () => {
    console.log(`\n🚀 HookRadar Server running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket available at ws://localhost:${PORT}/ws`);
    console.log(`🪝 Webhook endpoints at http://localhost:${PORT}/hook/<slug>\n`);
});
