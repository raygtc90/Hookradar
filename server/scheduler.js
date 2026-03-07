import { formatSqliteDate } from './auth.js';
import { stmts } from './database.js';

const POLL_INTERVAL_MS = 5000;
const DEFAULT_USER_AGENT = 'HookRadar Scheduler/1.0';

let schedulerTimer = null;
let schedulerBaseUrl = null;
let pollInFlight = false;
const runningSchedules = new Set();

function normalizeSchedulePath(value) {
    const trimmed = (value || '').trim();
    if (!trimmed || trimmed === '/') return '/';
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function getScheduleTargetUrl(baseUrl, slug, schedulePath) {
    const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
    const normalizedPath = normalizeSchedulePath(schedulePath);
    return `${normalizedBaseUrl}/hook/${slug}${normalizedPath === '/' ? '' : normalizedPath}`;
}

function computeNextRunAt(intervalMinutes, from = new Date()) {
    return formatSqliteDate(new Date(from.getTime() + (intervalMinutes * 60 * 1000)));
}

function parseHeaders(rawHeaders, body) {
    let headers = {};

    try {
        const parsed = JSON.parse(rawHeaders || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            headers = parsed;
        }
    } catch {
        headers = {};
    }

    if (!headers['User-Agent'] && !headers['user-agent']) {
        headers['User-Agent'] = DEFAULT_USER_AGENT;
    }

    if (body && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
    }

    return headers;
}

async function dispatchSchedule(schedule, baseUrl) {
    const body = schedule.body || '';
    const response = await fetch(getScheduleTargetUrl(baseUrl, schedule.slug, schedule.path), {
        method: schedule.method,
        headers: parseHeaders(schedule.headers, body),
        body: ['GET', 'HEAD'].includes(schedule.method) ? undefined : body,
    });

    return {
        status: response.status,
        url: response.url,
    };
}

async function executeSchedule(schedule, { baseUrl, manual = false } = {}) {
    const now = new Date();
    const nextRunAt = schedule.is_active ? computeNextRunAt(schedule.interval_minutes, now) : null;

    stmts.updateScheduleRuntime.run(formatSqliteDate(now), nextRunAt, schedule.id);

    try {
        return await dispatchSchedule(schedule, baseUrl);
    } catch (err) {
        const prefix = manual ? 'Manual schedule run failed' : 'Scheduled delivery failed';
        throw new Error(`${prefix}: ${err.message}`);
    }
}

async function pollSchedules() {
    if (pollInFlight || !schedulerBaseUrl) return;

    pollInFlight = true;

    try {
        const dueSchedules = stmts.getDueSchedules.all();

        for (const schedule of dueSchedules) {
            if (runningSchedules.has(schedule.id)) {
                continue;
            }

            runningSchedules.add(schedule.id);

            try {
                await executeSchedule(schedule, { baseUrl: schedulerBaseUrl });
            } catch (err) {
                console.error(`⏱️ ${err.message} (${schedule.id})`);
            } finally {
                runningSchedules.delete(schedule.id);
            }
        }
    } finally {
        pollInFlight = false;
    }
}

function startScheduler({ port }) {
    if (schedulerTimer) {
        return;
    }

    schedulerBaseUrl = (process.env.INTERNAL_BASE_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '');
    schedulerTimer = setInterval(() => {
        void pollSchedules();
    }, POLL_INTERVAL_MS);

    void pollSchedules();
}

function stopScheduler() {
    if (!schedulerTimer) {
        return;
    }

    clearInterval(schedulerTimer);
    schedulerTimer = null;
    schedulerBaseUrl = null;
    runningSchedules.clear();
}

async function runScheduleNow(schedule) {
    if (!schedulerBaseUrl) {
        throw new Error('Scheduler is not running');
    }

    return await executeSchedule(schedule, { baseUrl: schedulerBaseUrl, manual: true });
}

export {
    computeNextRunAt,
    normalizeSchedulePath,
    runScheduleNow,
    startScheduler,
    stopScheduler,
};
