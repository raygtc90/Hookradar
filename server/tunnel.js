import { spawn, spawnSync } from 'child_process';
import readline from 'readline';

const CLOUDFLARED_BIN = process.env.CLOUDFLARED_BIN || 'cloudflared';
const INSTALL_URL = 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/';
const QUICK_TUNNEL_URL_RE = /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const MANUAL_PUBLIC_BASE_URL = normalizeOrigin(process.env.PUBLIC_BASE_URL);

let tunnelProcess = null;
let tunnelState = createIdleState();
let tunnelExitListenersBound = false;

function normalizeOrigin(value) {
    if (!value) return null;

    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function isCloudflaredInstalled() {
    const result = spawnSync(CLOUDFLARED_BIN, ['--version'], { stdio: 'ignore' });
    return result.status === 0;
}

function isLocalTargetUrl(value) {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && LOCAL_HOSTS.has(url.hostname);
    } catch {
        return false;
    }
}

function createIdleState() {
    return {
        provider: MANUAL_PUBLIC_BASE_URL ? 'manual' : 'cloudflared',
        installed: MANUAL_PUBLIC_BASE_URL ? true : isCloudflaredInstalled(),
        running: Boolean(MANUAL_PUBLIC_BASE_URL),
        public_base_url: MANUAL_PUBLIC_BASE_URL,
        target_url: null,
        source: MANUAL_PUBLIC_BASE_URL ? 'env' : null,
        started_at: null,
        error: null,
        install_url: INSTALL_URL,
    };
}

function currentStatus() {
    if (MANUAL_PUBLIC_BASE_URL) {
        return {
            ...createIdleState(),
            running: true,
            public_base_url: MANUAL_PUBLIC_BASE_URL,
            source: 'env',
        };
    }

    tunnelState.installed = isCloudflaredInstalled();
    return {
        ...tunnelState,
        install_url: INSTALL_URL,
    };
}

function bindCleanupHandlers() {
    if (tunnelExitListenersBound) return;
    tunnelExitListenersBound = true;

    const cleanup = () => {
        if (tunnelProcess && tunnelProcess.exitCode === null) {
            tunnelProcess.kill('SIGTERM');
        }
    };

    process.once('exit', cleanup);
}

async function stopPublicTunnel() {
    if (MANUAL_PUBLIC_BASE_URL) {
        return currentStatus();
    }

    if (!tunnelProcess || tunnelProcess.exitCode !== null) {
        tunnelProcess = null;
        tunnelState = createIdleState();
        return currentStatus();
    }

    const activeProcess = tunnelProcess;

    await new Promise((resolve) => {
        let resolved = false;

        const finish = () => {
            if (resolved) return;
            resolved = true;
            resolve();
        };

        activeProcess.once('exit', finish);
        activeProcess.kill('SIGTERM');

        setTimeout(() => {
            if (activeProcess.exitCode === null) {
                activeProcess.kill('SIGKILL');
            }
            finish();
        }, 2000);
    });

    tunnelProcess = null;
    tunnelState = createIdleState();
    return currentStatus();
}

async function startPublicTunnel(targetUrl) {
    const normalizedTargetUrl = normalizeOrigin(targetUrl);

    if (MANUAL_PUBLIC_BASE_URL) {
        return currentStatus();
    }

    if (!normalizedTargetUrl || !isLocalTargetUrl(normalizedTargetUrl)) {
        throw new Error('Public tunnel can only expose a local localhost URL');
    }

    if (!isCloudflaredInstalled()) {
        tunnelState = {
            ...createIdleState(),
            error: 'cloudflared is not installed. Install it to start a public URL.',
        };
        throw new Error(tunnelState.error);
    }

    if (tunnelProcess && tunnelProcess.exitCode === null) {
        if (tunnelState.target_url === normalizedTargetUrl && tunnelState.public_base_url) {
            return currentStatus();
        }

        await stopPublicTunnel();
    }

    bindCleanupHandlers();

    tunnelState = {
        provider: 'cloudflared',
        installed: true,
        running: false,
        public_base_url: null,
        target_url: normalizedTargetUrl,
        source: 'quick_tunnel',
        started_at: new Date().toISOString(),
        error: null,
        install_url: INSTALL_URL,
    };

    const child = spawn(CLOUDFLARED_BIN, ['tunnel', '--url', normalizedTargetUrl, '--no-autoupdate'], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    tunnelProcess = child;

    return await new Promise((resolve, reject) => {
        let settled = false;

        const complete = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            fn(value);
        };

        const handleLine = (line) => {
            const match = line.match(QUICK_TUNNEL_URL_RE);
            if (match) {
                tunnelState = {
                    ...tunnelState,
                    running: true,
                    public_base_url: match[1],
                    error: null,
                };
                complete(resolve, currentStatus());
                return;
            }

            if (/error/i.test(line) || /failed/i.test(line)) {
                tunnelState = {
                    ...tunnelState,
                    error: line.trim(),
                };
            }
        };

        readline.createInterface({ input: child.stdout }).on('line', handleLine);
        readline.createInterface({ input: child.stderr }).on('line', handleLine);

        child.once('error', (err) => {
            tunnelProcess = null;
            tunnelState = {
                ...createIdleState(),
                error: err.message,
            };
            complete(reject, err);
        });

        child.once('exit', (code, signal) => {
            const startFailed = !settled;
            const exitReason = tunnelState.error || `cloudflared exited (${signal || code || 'unknown'})`;

            tunnelProcess = null;
            tunnelState = {
                ...createIdleState(),
                error: startFailed ? exitReason : 'Public URL stopped',
            };

            if (startFailed) {
                complete(reject, new Error(exitReason));
            }
        });

        const timeoutId = setTimeout(() => {
            if (child.exitCode === null) {
                child.kill('SIGTERM');
            }

            tunnelState = {
                ...createIdleState(),
                error: 'Timed out while waiting for cloudflared to provide a public URL',
            };

            complete(reject, new Error(tunnelState.error));
        }, 15000);
    });
}

export {
    currentStatus as getPublicTunnelStatus,
    startPublicTunnel,
    stopPublicTunnel,
};
