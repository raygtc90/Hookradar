# <img src="public/hookradar-icon.svg" width="40" style="vertical-align: middle;" alt="HookRadar logo" /> HookRadar

### Open Source Webhook Tester and Debugger

> Create webhook endpoints, inspect requests in real time, replay them, and run the app on your own machine or server.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://reactjs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](CONTRIBUTING.md)

**Live App:** [hookradar.up.railway.app](https://hookradar.up.railway.app)

**Note:** The hosted Railway app is a shared public instance with account-based isolation. For private use, run HookRadar on your own machine or server.

---

## What Is HookRadar?

HookRadar is an open source tool for receiving and inspecting webhooks.

Use it to:

- generate a unique webhook URL
- create a private account workspace on a shared deployment
- inspect headers, query parameters, and payloads
- monitor requests live over WebSocket
- replay captured requests to another URL
- export request history as CSV
- customize response status, headers, body, and delay
- run the app locally, on your own server, or on a hosted instance

If you already use tools like Webhook.site or RequestBin, HookRadar gives you a similar workflow with self-hosting support.

---

## Features

| Feature | Description |
|---------|-------------|
| 🔗 **Unique Webhook URLs** | Generate unique endpoints to receive webhooks |
| 🔐 **Private Workspaces** | Sign in and keep endpoints and requests isolated per account |
| ✍️ **Custom Slugs** | Choose your own webhook path when creating an endpoint |
| ⚡ **Real-time Dashboard** | Watch incoming requests appear instantly (WebSocket) |
| 🔍 **Payload Inspector** | View headers, body, query params, method, IP, size |
| 📜 **Request History** | All past requests saved & searchable |
| 🔄 **Replay / Forward** | Replay any captured request to another URL |
| 📤 **Auto-Forwarding** | Auto-forward webhooks to your server in real-time |
| 🎨 **Response Customizer** | Set custom status codes, headers, body, and delays |
| 📋 **cURL Export** | One-click cURL command generation for any request |
| 🔎 **Advanced Filters** | Filter by method, status, content-type, date range |
| 📦 **CSV Export** | Export request history for an endpoint as CSV |
| 🤖 **AI Analysis** | Smart source detection, security audit, code generation |
| 🖥️ **CLI Tool** | Full CLI — `hookradar create`, `hookradar listen` |
| 🌙 **Modern UI** | Clean interface built for day-to-day debugging |
| 💾 **Persistent Storage** | SQLite database stores all endpoints and requests |
| 🐳 **Docker Ready** | Self-host with a single `docker compose up` |
| 🚀 **Self-hosted** | Run on your own server, own your data |

---

## Why HookRadar?

| | Webhook.site | RequestBin | Hookdeck | **HookRadar** |
|---|---|---|---|---|
| **Open Source** | ❌ | ❌ | ❌ | ✅ |
| **Free** | Limited (100 req) | Limited | Paid | ✅ Unlimited |
| **Self-hosted** | ❌ | ❌ | ❌ | ✅ |
| **Real-time** | ✅ | ❌ | ✅ | ✅ |
| **Custom Responses** | Paid | ❌ | ✅ | ✅ |
| **Request Replay** | Paid | ❌ | ✅ | ✅ |
| **Auto-Forwarding** | ❌ | ❌ | ✅ | ✅ |
| **Advanced Filters** | ❌ | ❌ | ✅ | ✅ |
| **AI Analysis** | ❌ | ❌ | ❌ | ✅ |
| **CLI Tool** | ❌ | ❌ | ❌ | ✅ |
| **Docker** | ❌ | ❌ | ❌ | ✅ |

> **Postman vs HookRadar:** Postman is for sending requests to an API. HookRadar is for receiving and inspecting requests sent to you by another service.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 19 + Vite | Dashboard UI |
| Backend | Node.js + Express | API + Webhook receiver |
| Real-time | WebSockets (ws) | Live updates |
| Database | SQLite (better-sqlite3) | Request storage |
| Icons | Lucide React | Icon set |
| Styling | Vanilla CSS | App styling |

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/aniketmishra-0/hookradar.git
cd Hookradar

# Install dependencies
npm install

# Optional: copy env template
cp .env.example .env

# Start development server (frontend + backend)
npm run dev
```

Open http://localhost:5173

### Production Mode (single process)

```bash
npm install
npm run build
npm start
```

Open http://localhost:3001

### Docker (Self-hosting)

```bash
# Using Docker Compose (recommended)
docker compose up -d

# Or build manually
docker build -t hookradar .
docker run -p 3001:3001 -v hookradar-data:/app/data hookradar
```

Open http://localhost:3001

---

## Deployment Modes

HookRadar can be used in three ways:

1. **Local development** — Run `npm run dev` on your laptop.
2. **Self-host on your own server** — Use Docker or Node on any VPS, VM, or laptop.
3. **Public shared instance** — Deploy once on Railway and share one public app URL.

### Shared Instance vs Self-Hosted

- **Shared Railway instance:** users sign in to separate workspaces and each endpoint gets a unique `/hook/<slug>` URL under the same base domain.
- **Self-hosted instance:** each user runs their own copy on their own laptop or server and keeps their own data.

> **Important:** A public Railway deployment still uses one app and one database, but account isolation is now enforced at the application level. Enterprise features such as SSO and custom domains are still planned.

---

## Deploy on Railway

Railway is the simplest way to make HookRadar available on a public URL without keeping your laptop online.

### What a Railway Deployment Looks Like

- Base app URL: `https://your-app-name.up.railway.app`
- Webhook URL per endpoint: `https://your-app-name.up.railway.app/hook/<slug>`
- Every user gets a different slug, but the same shared app domain

### Current Public Instance

- Live app: [hookradar.up.railway.app](https://hookradar.up.railway.app)

### Railway Steps

1. Push this repo to GitHub.
2. Create a new Railway project from the GitHub repo.
3. Let Railway deploy the included `Dockerfile`.
4. Add a **Volume** and mount it at `/app/data`.
5. Keep `DATABASE_PATH=/app/data/hookradar.db`.
6. Generate a public Railway domain.
7. Open the app URL, create endpoints, and share `/hook/<slug>` URLs.

### Why the Volume Matters

SQLite data must live inside the mounted volume. Otherwise, redeploys can remove endpoints and request history. HookRadar supports a configurable database path through `DATABASE_PATH`, and the Docker setup uses `/app/data/hookradar.db` by default.

---

## Run on Your Own Server

Anyone can run HookRadar on their own laptop, VM, or VPS. Your laptop is not required.

### Option 1: Docker Compose

```bash
git clone https://github.com/aniketmishra-0/Hookradar.git
cd Hookradar
docker compose up -d
```

Open `http://SERVER_IP:3001`

### Option 2: Node.js

```bash
git clone https://github.com/aniketmishra-0/Hookradar.git
cd Hookradar
npm install
npm run build
npm start
```

Open `http://SERVER_IP:3001`

### If They Need a Public Webhook URL From Their Own Laptop

They can run HookRadar locally and expose it themselves using a tunnel:

```bash
cloudflared tunnel --url http://localhost:3001
```

That gives them a public URL that points to their own machine.

---

## Environment Variables

| Variable | Default | Purpose |
|---------|---------|---------|
| `PORT` | `3001` | HTTP port for the Express server |
| `DATABASE_PATH` | `./hookradar.db` locally, `/app/data/hookradar.db` in Docker | SQLite file location |
| `HOOKRADAR_SERVER` | `http://localhost:3001` | CLI target server |

---

## Usage

### 1. Create an Endpoint
Click **Create Webhook Endpoint** to get a unique URL such as `http://localhost:3001/hook/abc123` locally or `https://your-app.up.railway.app/hook/abc123` in production.

### 2. Send Webhooks

```bash
# POST with JSON payload
curl -X POST http://localhost:3001/hook/YOUR_SLUG \
  -H "Content-Type: application/json" \
  -d '{"event": "payment.completed", "amount": 99.99, "currency": "INR"}'

# GET with query parameters
curl "http://localhost:3001/hook/YOUR_SLUG?status=active&page=1"

# PUT request
curl -X PUT http://localhost:3001/hook/YOUR_SLUG \
  -H "Content-Type: application/json" \
  -d '{"name": "Aniket", "role": "admin"}'
```

### 3. Inspect & Debug
- Click any request to see headers, body, and query parameters
- Copy a cURL command to reproduce the same request
- View the IP address, size, response time, and content type

### 4. Customize Responses
- **Status Code**: 200, 201, 400, 404, 500, etc.
- **Headers**: Custom response headers (JSON)
- **Body**: Custom response body
- **Delay**: Simulate slow responses (0-30000ms)

### 5. Replay / Forward
Click **Replay** on any request, enter a target URL, and forward the same request again.

### 6. Auto-Forwarding
Set a **Forwarding URL** to automatically send each captured webhook to another server. HookRadar stores the request first, then forwards it.

### 7. Advanced Filters
Filter requests by method, status, content type, or date range.

### 8. AI Analysis
Use the **AI** panel to inspect request patterns, detect likely sources, review security concerns, and generate sample handler code. It runs locally.

### 9. CLI Tool

```bash
# Install globally
npm install -g hookradar

# Create an endpoint
hookradar create -n "My Webhook"

# Listen for webhooks in real-time
hookradar listen <slug>

# Quick create + listen
hookradar quick

# List all endpoints
hookradar list

# View recent requests
hookradar inspect <slug>

# Replay to another URL
hookradar replay <slug> https://your-server.com/webhook

# Server statistics
hookradar stats
```

---

## Project Structure

```
hookradar/
├── bin/
│   └── hookradar.js         # CLI tool
├── server/
│   ├── server.js            # Express + WebSocket server
│   └── database.js          # SQLite database setup
├── src/
│   ├── components/
│   │   ├── Sidebar.jsx           # Navigation & endpoint list
│   │   ├── Dashboard.jsx         # Home with stats & quick actions
│   │   ├── EndpointView.jsx      # Request list + filters + detail
│   │   ├── RequestDetail.jsx     # Request inspector (tabs)
│   │   ├── ResponseConfig.jsx    # Response + forwarding config
│   │   ├── AIAnalysisPanel.jsx   # AI analysis (4 tabs)
│   │   └── CreateEndpointModal.jsx
│   ├── utils/
│   │   ├── api.js           # API client & utilities
│   │   └── analyzer.js      # AI analysis engine (offline)
│   ├── App.jsx              # Main app with state management
│   ├── main.jsx             # Entry point
│   └── index.css            # Design system (CSS variables)
├── public/
│   └── hookradar-icon.svg   # Primary HookRadar brand mark/favicon
├── Dockerfile               # Docker support
├── docker-compose.yml       # Docker Compose
├── CONTRIBUTING.md          # Contribution guide
├── LICENSE                  # MIT License
└── package.json
```

---

## Roadmap

| Phase | Timeline | Features | Status |
|-------|----------|----------|--------|
| **Phase 1** | Week 1-2 | Backend + Basic UI | ✅ Done |
| **Phase 2** | Week 3-4 | React Dashboard + WebSocket | ✅ Done |
| **Phase 3** | Week 5-6 | Replay, Filter, CLI Tool | ✅ Done |
| **Phase 4** | Month 3-4 | AI Integration (Payload Analysis) | ✅ Done |
| **Phase 5** | Month 2 | Open Source Launch (Product Hunt, Reddit) | ✅ Done |
| **Phase 6** | Ongoing | Community building, Regular releases | 📋 Planned |

### Future Features
- 🔐 **HMAC Signature Verification** — Verify webhook signatures
- 📊 **Analytics Dashboard** — Request trends & patterns
- 🔗 **Team Collaboration** — Share endpoints with team
- 🔔 **Email/Slack Notifications** — Alert on incoming webhooks
- 📱 **Mobile App** — Monitor webhooks on the go

### Pro & Enterprise Features

The items below describe planned additions for future hosted HookRadar plans.

Already available today:

- **Private accounts and workspaces**
- **Custom webhook slugs**
- **CSV export**

- **Custom Actions** — Create advanced custom workflows
- **Schedules and Uptime Monitors**
- **Custom URL and Email Addresses**
- **Non-Expiring URLs and Email Addresses**
- **Unlimited Requests and Emails per URL**
- **Localhost Forwarding**
- **Email Support**

### Enterprise Features

- **Custom Domain**
- **Shared Team Workspaces**
- **SAML 2.0 Single Sign-On**

---

## Contributing

We welcome contributions of all kinds. See the [Contributing Guide](CONTRIBUTING.md).

You do not need to be a coding expert to help. You can:
- 🐛 Report bugs
- 📝 Improve documentation
- 🎨 Suggest UI improvements
- 🌐 Improve copy or documentation
- ⭐ Star the repo!

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [Lucide Icons](https://lucide.dev/) — Beautiful icon set
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — Fast SQLite bindings
- Inspired by Webhook.site, RequestBin, and the developer community

---

If you find the project useful, consider starring the repository.
