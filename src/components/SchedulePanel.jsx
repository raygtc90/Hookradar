import { useEffect, useState } from 'react';
import { CalendarClock, Clock3, Play, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api, formatTime, normalizeRequestPath, tryParseJSON } from '../utils/api';

const DEFAULT_HEADERS = JSON.stringify({ 'Content-Type': 'application/json' }, null, 2);
const DEFAULT_BODY = JSON.stringify({ source: 'hookradar-schedule', ping: true }, null, 2);
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function createScheduleDraft(schedule = {}) {
    const parsedHeaders = tryParseJSON(schedule.headers);

    return {
        id: schedule.id,
        name: schedule.name || '',
        method: schedule.method || 'POST',
        path: normalizeRequestPath(schedule.path),
        headers: parsedHeaders ? JSON.stringify(parsedHeaders, null, 2) : (schedule.headers || DEFAULT_HEADERS),
        body: typeof schedule.body === 'string' ? schedule.body : DEFAULT_BODY,
        interval_minutes: schedule.interval_minutes || 15,
        is_active: schedule.is_active === 0 ? 0 : 1,
        last_run_at: schedule.last_run_at || null,
        next_run_at: schedule.next_run_at || null,
        created_at: schedule.created_at || null,
        updated_at: schedule.updated_at || null,
    };
}

function buildSchedulePayload(schedule) {
    let headers;

    try {
        const parsedHeaders = JSON.parse(schedule.headers || '{}');
        if (!parsedHeaders || typeof parsedHeaders !== 'object' || Array.isArray(parsedHeaders)) {
            throw new Error();
        }
        headers = JSON.stringify(parsedHeaders);
    } catch {
        throw new Error('Schedule headers must be valid JSON');
    }

    const intervalMinutes = parseInt(schedule.interval_minutes, 10);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
        throw new Error('Interval must be between 1 and 1440 minutes');
    }

    return {
        name: schedule.name.trim(),
        method: schedule.method,
        path: normalizeRequestPath(schedule.path),
        headers,
        body: schedule.body,
        interval_minutes: intervalMinutes,
        is_active: schedule.is_active ? 1 : 0,
    };
}

export default function SchedulePanel({ endpoint }) {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [savingId, setSavingId] = useState(null);
    const [runningId, setRunningId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);

    useEffect(() => {
        let cancelled = false;

        const loadSchedules = async () => {
            setLoading(true);

            try {
                const response = await api.getSchedules(endpoint.id);
                if (!cancelled) {
                    setSchedules(response.data.map(createScheduleDraft));
                }
            } catch (err) {
                if (!cancelled) {
                    toast.error(err.message);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadSchedules();

        return () => {
            cancelled = true;
        };
    }, [endpoint.id]);

    const handleChange = (scheduleId, key, value) => {
        setSchedules((current) => current.map((schedule) => (
            schedule.id === scheduleId
                ? { ...schedule, [key]: value }
                : schedule
        )));
    };

    const handleCreateSchedule = async () => {
        setCreating(true);

        try {
            const response = await api.createSchedule(endpoint.id, {
                name: '',
                method: 'POST',
                path: '/',
                headers: DEFAULT_HEADERS,
                body: DEFAULT_BODY,
                interval_minutes: 15,
                is_active: 1,
            });

            setSchedules((current) => [createScheduleDraft(response.data), ...current]);
            toast.success('Schedule created');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setCreating(false);
        }
    };

    const handleSaveSchedule = async (schedule) => {
        setSavingId(schedule.id);

        try {
            const response = await api.updateSchedule(schedule.id, buildSchedulePayload(schedule));
            setSchedules((current) => current.map((item) => (
                item.id === schedule.id ? createScheduleDraft(response.data) : item
            )));
            toast.success('Schedule saved');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSavingId(null);
        }
    };

    const handleRunNow = async (schedule) => {
        setRunningId(schedule.id);

        try {
            const response = await api.runScheduleNow(schedule.id);
            setSchedules((current) => current.map((item) => (
                item.id === schedule.id ? createScheduleDraft(response.data.schedule) : item
            )));
            toast.success(`Schedule fired (${response.data.status})`);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setRunningId(null);
        }
    };

    const handleDelete = async (schedule) => {
        if (!confirm(`Delete schedule${schedule.name ? ` "${schedule.name}"` : ''}?`)) {
            return;
        }

        setDeletingId(schedule.id);

        try {
            await api.deleteSchedule(schedule.id);
            setSchedules((current) => current.filter((item) => item.id !== schedule.id));
            toast.success('Schedule deleted');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="settings-section">
            <div className="schedule-section-header">
                <div>
                    <h3>
                        <CalendarClock size={16} />
                        Schedules
                    </h3>
                    <p className="schedule-section-copy">
                        Fire repeatable synthetic webhooks into this endpoint. Useful for heartbeat tests, retry drills, and demo traffic.
                    </p>
                </div>

                <button className="btn btn-secondary btn-sm" onClick={handleCreateSchedule} disabled={creating}>
                    <Plus className="icon" size={14} />
                    {creating ? 'Creating...' : 'New schedule'}
                </button>
            </div>

            {loading ? (
                <div className="settings-card schedule-empty-state">
                    <p>Loading schedules...</p>
                </div>
            ) : schedules.length === 0 ? (
                <div className="settings-card schedule-empty-state">
                    <CalendarClock size={18} />
                    <div>
                        <strong>No schedules yet</strong>
                        <p>Create one to send repeating webhook traffic into this endpoint.</p>
                    </div>
                </div>
            ) : (
                <div className="schedule-list">
                    {schedules.map((schedule) => (
                        <div key={schedule.id} className="settings-card schedule-card">
                            <div className="schedule-card-header">
                                <div>
                                    <div className="schedule-card-title">
                                        <strong>{schedule.name || schedule.path}</strong>
                                        <span className={`schedule-state-badge ${schedule.is_active ? 'live' : 'paused'}`}>
                                            {schedule.is_active ? 'Active' : 'Paused'}
                                        </span>
                                    </div>
                                    <div className="schedule-card-meta">
                                        <span>{schedule.method}</span>
                                        <span>{normalizeRequestPath(schedule.path)}</span>
                                        <span>Every {schedule.interval_minutes} min</span>
                                        <span>{schedule.next_run_at ? `Next ${formatTime(schedule.next_run_at)}` : 'Not scheduled'}</span>
                                        <span>{schedule.last_run_at ? `Last ${formatTime(schedule.last_run_at)}` : 'Never fired'}</span>
                                    </div>
                                </div>

                                <div className="schedule-card-actions">
                                    <button className="btn btn-secondary btn-sm" onClick={() => handleRunNow(schedule)} disabled={runningId === schedule.id}>
                                        <Play className="icon" size={14} />
                                        {runningId === schedule.id ? 'Running...' : 'Run now'}
                                    </button>
                                    <button className="btn btn-primary btn-sm" onClick={() => handleSaveSchedule(schedule)} disabled={savingId === schedule.id}>
                                        <Save className="icon" size={14} />
                                        {savingId === schedule.id ? 'Saving...' : 'Save'}
                                    </button>
                                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(schedule)} disabled={deletingId === schedule.id}>
                                        <Trash2 className="icon" size={14} />
                                        {deletingId === schedule.id ? 'Deleting...' : 'Delete'}
                                    </button>
                                </div>
                            </div>

                            <div className="schedule-grid">
                                <div className="form-group">
                                    <label className="form-label">Name</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={schedule.name}
                                        onChange={(event) => handleChange(schedule.id, 'name', event.target.value)}
                                        placeholder="Heartbeat check"
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Method</label>
                                    <select
                                        className="form-input"
                                        value={schedule.method}
                                        onChange={(event) => handleChange(schedule.id, 'method', event.target.value)}
                                    >
                                        {HTTP_METHODS.map((method) => (
                                            <option key={method} value={method}>{method}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Every (minutes)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="1440"
                                        className="form-input"
                                        value={schedule.interval_minutes}
                                        onChange={(event) => handleChange(schedule.id, 'interval_minutes', event.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Subpath</label>
                                <input
                                    type="text"
                                    className="form-input mono"
                                    value={schedule.path}
                                    onChange={(event) => handleChange(schedule.id, 'path', event.target.value)}
                                    placeholder="/status/ping"
                                />
                                <span className="form-hint">
                                    The schedule posts to <code>/hook/{endpoint.slug}</code> plus this optional subpath.
                                </span>
                            </div>

                            <div className="schedule-grid schedule-grid-textareas">
                                <div className="form-group">
                                    <label className="form-label">Headers (JSON)</label>
                                    <textarea
                                        className="form-input mono"
                                        rows={6}
                                        value={schedule.headers}
                                        onChange={(event) => handleChange(schedule.id, 'headers', event.target.value)}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Body</label>
                                    <textarea
                                        className="form-input mono"
                                        rows={6}
                                        value={schedule.body}
                                        onChange={(event) => handleChange(schedule.id, 'body', event.target.value)}
                                        placeholder="Optional schedule payload"
                                    />
                                </div>
                            </div>

                            <div className="toggle-row">
                                <div>
                                    <div className="toggle-label">Schedule active</div>
                                    <div className="toggle-desc">Paused schedules stop queuing future runs until you save them as active again.</div>
                                </div>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={schedule.is_active === 1 || schedule.is_active === true}
                                        onChange={(event) => handleChange(schedule.id, 'is_active', event.target.checked ? 1 : 0)}
                                    />
                                    <span className="toggle-slider" />
                                </label>
                            </div>

                            <div className="schedule-runtime-note">
                                <Clock3 size={14} />
                                <span>Scheduled requests hit the same webhook capture pipeline as external traffic, so they appear in the live feed instantly.</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
