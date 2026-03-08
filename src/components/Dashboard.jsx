import {
    Activity,
    ArrowRight,
    Clock3,
    Gauge,
    Orbit,
    Plus,
    Radio,
    ShieldCheck,
    Sparkles,
    Trash2,
    Webhook,
    Zap,
} from 'lucide-react';
import { CollapsedPanel, HiddenSectionsTray, SectionVisibilityButtons } from './SectionVisibility';
import { dashboardLayoutSections } from '../utils/layoutPreferences';
import { formatTime, getWebhookUrl } from '../utils/api';

const isEndpointActive = (endpoint) => endpoint.is_active === 1 || endpoint.is_active === true;

function formatCompact(value) {
    return new Intl.NumberFormat('en-IN', {
        notation: 'compact',
        maximumFractionDigits: value > 999 ? 1 : 0,
    }).format(value || 0);
}

export default function Dashboard({
    stats,
    endpoints,
    sectionPreferences,
    onCreateEndpoint,
    onChangeSectionMode,
    onSelectEndpoint,
    onDeleteEndpoint,
}) {
    const activeEndpoints = endpoints.filter(isEndpointActive).length;
    const inactiveEndpoints = endpoints.length - activeEndpoints;
    const readiness = endpoints.length ? Math.round((activeEndpoints / endpoints.length) * 100) : 0;
    const averageTraffic = endpoints.length ? Math.round(stats.total_requests / endpoints.length) : 0;
    const sortedByTraffic = [...endpoints].sort((a, b) => (b.request_count || 0) - (a.request_count || 0));
    const sortedByRecent = [...endpoints].sort((a, b) => {
        const left = a.last_request_at || a.created_at || 0;
        const right = b.last_request_at || b.created_at || 0;
        return new Date(right) - new Date(left);
    });
    const featuredEndpoint = sortedByTraffic[0] || sortedByRecent[0] || null;
    const mostRecentEndpoint = sortedByRecent[0] || null;
    const topTrafficBaseline = sortedByTraffic[0]?.request_count || 1;

    const statCards = [
        {
            icon: Webhook,
            tone: 'blue',
            label: 'Active routes',
            value: stats.total_endpoints,
            note: endpoints.length ? `${activeEndpoints} live, ${inactiveEndpoints} paused` : 'No routes created yet',
        },
        {
            icon: Activity,
            tone: 'cyan',
            label: 'Captured events',
            value: formatCompact(stats.total_requests),
            note: featuredEndpoint ? `${featuredEndpoint.name || featuredEndpoint.slug} is leading traffic` : 'Traffic history builds here',
        },
        {
            icon: Zap,
            tone: 'orange',
            label: 'Requests today',
            value: formatCompact(stats.requests_today),
            note: stats.requests_today ? 'Live signal is flowing through the workspace' : 'Quiet day so far',
        },
        {
            icon: Radio,
            tone: 'green',
            label: 'Readiness score',
            value: `${readiness}%`,
            note: endpoints.length ? 'Share of endpoints that are currently active' : 'Create a route to unlock coverage',
        },
    ];

    const operatingNotes = [
        {
            icon: Orbit,
            label: 'Routing coverage',
            value: endpoints.length ? `${activeEndpoints}/${endpoints.length}` : '0/0',
            note: endpoints.length ? `${inactiveEndpoints} endpoint${inactiveEndpoints === 1 ? '' : 's'} need attention` : 'No routes to monitor yet',
        },
        {
            icon: Gauge,
            label: 'Average load',
            value: endpoints.length ? `${averageTraffic}` : '0',
            note: 'Captured requests per endpoint across the workspace',
        },
        {
            icon: Sparkles,
            label: 'Hottest route',
            value: featuredEndpoint ? (featuredEndpoint.name || featuredEndpoint.slug) : 'None yet',
            note: featuredEndpoint ? `${featuredEndpoint.request_count || 0} total requests` : 'Send a test webhook to populate insights',
        },
        {
            icon: ShieldCheck,
            label: 'Last movement',
            value: mostRecentEndpoint?.last_request_at ? formatTime(mostRecentEndpoint.last_request_at) : 'Waiting',
            note: mostRecentEndpoint ? (mostRecentEndpoint.name || mostRecentEndpoint.slug) : 'No recent endpoint activity',
        },
    ];

    const quickActions = [
        {
            icon: Plus,
            title: 'Spin up a fresh intake route',
            copy: 'Create a fresh webhook URL in one step.',
            action: onCreateEndpoint,
            tone: 'blue',
        },
        {
            icon: Radio,
            title: 'Keep the live stream open',
            copy: 'Open the route with the most recent traffic and inspect requests live.',
            action: () => featuredEndpoint && onSelectEndpoint(featuredEndpoint),
            tone: 'cyan',
            disabled: !featuredEndpoint,
        },
        {
            icon: ShieldCheck,
            title: 'Tune the response layer',
            copy: 'Open an endpoint to set quick responses, forwarding, or automations.',
            action: () => featuredEndpoint && onSelectEndpoint(featuredEndpoint),
            tone: 'orange',
            disabled: !featuredEndpoint,
        },
    ];

    const getSectionMode = (sectionId) => sectionPreferences?.[sectionId] || 'expanded';
    const setSectionMode = (sectionId, mode) => onChangeSectionMode(sectionId, mode);
    const hiddenSections = dashboardLayoutSections.filter((section) => getSectionMode(section.id) === 'hidden');

    return (
        <div className="dashboard">
            <HiddenSectionsTray
                sections={hiddenSections}
                onRestore={(sectionId) => setSectionMode(sectionId, 'expanded')}
                className="dashboard-hidden-sections"
            />

            {getSectionMode('dashboard.hero') === 'collapsed' ? (
                <CollapsedPanel
                    className="dashboard-hero dashboard-section-collapsed"
                    kicker="Webhook workspace"
                    title="Workspace overview"
                    summary={featuredEndpoint
                        ? `${featuredEndpoint.name || featuredEndpoint.slug} is currently your busiest route.`
                        : 'Create one endpoint to start capturing traffic and unlock the live workspace.'}
                    mode={getSectionMode('dashboard.hero')}
                    onChangeMode={(mode) => setSectionMode('dashboard.hero', mode)}
                >
                    <div className="section-collapsed-pill-row">
                        <span className="request-pill">{stats.total_endpoints} routes</span>
                        <span className="request-pill">{formatCompact(stats.total_requests)} events</span>
                        <span className="request-pill">{stats.requests_today} today</span>
                    </div>
                </CollapsedPanel>
            ) : getSectionMode('dashboard.hero') !== 'hidden' && (
                <section className="dashboard-hero">
                    <div className="dashboard-hero-copy">
                        <div className="section-heading-row">
                            <div className="dashboard-eyebrow">
                                <Orbit size={14} />
                                Webhook workspace
                            </div>
                            <SectionVisibilityButtons
                                mode={getSectionMode('dashboard.hero')}
                                onChangeMode={(mode) => setSectionMode('dashboard.hero', mode)}
                            />
                        </div>
                        <h1>Get a webhook URL, watch requests live, and open advanced tools only when you need them.</h1>
                        <p>
                            Start with one endpoint, copy the URL, and test immediately. Forwarding, schedules, spreadsheets,
                            alerts, CRM sync, and archives stay available when you are ready for them.
                        </p>

                        <div className="dashboard-hero-actions">
                            <button className="btn btn-primary" onClick={onCreateEndpoint}>
                                <Plus className="icon" />
                                Create new endpoint
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => featuredEndpoint && onSelectEndpoint(featuredEndpoint)}
                                disabled={!featuredEndpoint}
                            >
                                <ArrowRight className="icon" />
                                Open hottest route
                            </button>
                        </div>

                        <div className="dashboard-hero-badges">
                            <div className="dashboard-hero-badge">
                                <Radio size={14} />
                                Realtime stream online
                            </div>
                            <div className="dashboard-hero-badge">
                                <ShieldCheck size={14} />
                                Response simulation built in
                            </div>
                            <div className="dashboard-hero-badge">
                                <Sparkles size={14} />
                                Replay and export ready
                            </div>
                        </div>
                    </div>

                    <div className="dashboard-hero-panel">
                        <div className="dashboard-signal-card">
                            <div className="dashboard-signal-header">
                                <span>Workspace pulse</span>
                                <strong>{stats.requests_today} today</strong>
                            </div>

                            <div className="dashboard-signal-meter">
                                <span style={{ width: `${Math.max(readiness, endpoints.length ? 18 : 6)}%` }} />
                            </div>

                            <div className="dashboard-signal-grid">
                                <div className="dashboard-signal-item">
                                    <span>Endpoints</span>
                                    <strong>{stats.total_endpoints}</strong>
                                </div>
                                <div className="dashboard-signal-item">
                                    <span>Total traffic</span>
                                    <strong>{formatCompact(stats.total_requests)}</strong>
                                </div>
                                <div className="dashboard-signal-item">
                                    <span>Avg per route</span>
                                    <strong>{averageTraffic}</strong>
                                </div>
                                <div className="dashboard-signal-item">
                                    <span>Coverage</span>
                                    <strong>{readiness}%</strong>
                                </div>
                            </div>

                            {featuredEndpoint ? (
                                <button className="dashboard-signal-endpoint" onClick={() => onSelectEndpoint(featuredEndpoint)}>
                                    <div className="dashboard-signal-endpoint-label">
                                        <span>Featured endpoint</span>
                                        <ArrowRight size={14} />
                                    </div>
                                    <strong>{featuredEndpoint.name || featuredEndpoint.slug}</strong>
                                    <code>{getWebhookUrl(featuredEndpoint.slug)}</code>
                                    <p>
                                        {featuredEndpoint.request_count || 0} requests captured
                                        {featuredEndpoint.last_request_at ? ` • last seen ${formatTime(featuredEndpoint.last_request_at)}` : ''}
                                    </p>
                                </button>
                            ) : (
                                <div className="dashboard-signal-empty">
                                    Create an endpoint and send a test webhook to unlock the live workspace, request timeline, and replay tools.
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {getSectionMode('dashboard.stats') === 'collapsed' ? (
                <CollapsedPanel
                    className="dashboard-panel"
                    kicker="Signals"
                    title="Workspace metrics"
                    summary={`${stats.total_endpoints} routes • ${formatCompact(stats.total_requests)} events • ${stats.requests_today} today`}
                    mode={getSectionMode('dashboard.stats')}
                    onChangeMode={(mode) => setSectionMode('dashboard.stats', mode)}
                />
            ) : getSectionMode('dashboard.stats') !== 'hidden' && (
                <>
                    <div className="section-group-header">
                        <div>
                            <span className="dashboard-panel-kicker">Signals</span>
                            <h2>Workspace metrics</h2>
                        </div>
                        <SectionVisibilityButtons
                            mode={getSectionMode('dashboard.stats')}
                            onChangeMode={(mode) => setSectionMode('dashboard.stats', mode)}
                        />
                    </div>

                    <section className="stats-grid">
                        {statCards.map((card) => (
                            <article key={card.label} className="stat-card">
                                <div className={`stat-card-icon ${card.tone}`}>
                                    <card.icon size={22} />
                                </div>
                                <div className="stat-card-body">
                                    <span className="stat-card-label">{card.label}</span>
                                    <strong className="stat-card-value">{card.value}</strong>
                                    <p className="stat-card-note">{card.note}</p>
                                </div>
                            </article>
                        ))}
                    </section>
                </>
            )}

            <section className="dashboard-grid">
                {(getSectionMode('dashboard.inventory') !== 'hidden' || getSectionMode('dashboard.traffic') !== 'hidden') && (
                    <div className="dashboard-main-column">
                        {getSectionMode('dashboard.inventory') === 'collapsed' ? (
                            <CollapsedPanel
                                className="dashboard-panel"
                                kicker="Routes"
                                title="Endpoint inventory"
                                summary={endpoints.length
                                    ? `${endpoints.length} routes saved in the workspace.`
                                    : 'No endpoints yet. Create one to start receiving traffic.'}
                                mode={getSectionMode('dashboard.inventory')}
                                onChangeMode={(mode) => setSectionMode('dashboard.inventory', mode)}
                            >
                                {featuredEndpoint && (
                                    <div className="section-collapsed-inline-metrics">
                                        <strong>{featuredEndpoint.name || featuredEndpoint.slug}</strong>
                                        <span>{featuredEndpoint.request_count || 0} requests</span>
                                    </div>
                                )}
                            </CollapsedPanel>
                        ) : getSectionMode('dashboard.inventory') !== 'hidden' && (
                            <div className="dashboard-panel">
                                <div className="dashboard-panel-header">
                                    <div>
                                        <span className="dashboard-panel-kicker">Routes</span>
                                        <h2>Endpoint inventory</h2>
                                    </div>
                                    <div className="dashboard-panel-header-tools">
                                        <button className="btn btn-secondary btn-sm" onClick={onCreateEndpoint}>
                                            <Plus className="icon" />
                                            Add endpoint
                                        </button>
                                        <SectionVisibilityButtons
                                            mode={getSectionMode('dashboard.inventory')}
                                            onChangeMode={(mode) => setSectionMode('dashboard.inventory', mode)}
                                        />
                                    </div>
                                </div>

                                {endpoints.length === 0 ? (
                                    <div className="dashboard-empty-shell">
                                        <div className="dashboard-empty-icon">
                                            <Webhook size={28} />
                                        </div>
                                        <h3>Build your first intake route</h3>
                                        <p>
                                            Create one webhook URL and start testing immediately. The rest of the tooling stays there
                                            when you need it.
                                        </p>
                                        <div className="dashboard-empty-steps">
                                            <div className="dashboard-empty-step">
                                                <strong>1</strong>
                                                Create an endpoint for Stripe, GitHub, Shopify, or any custom app.
                                            </div>
                                            <div className="dashboard-empty-step">
                                                <strong>2</strong>
                                                Copy the URL or send a sample request and watch it appear instantly.
                                            </div>
                                            <div className="dashboard-empty-step">
                                                <strong>3</strong>
                                                Open advanced tools only if you need responses, schedules, integrations, or exports.
                                            </div>
                                        </div>
                                        <button className="btn btn-primary" onClick={onCreateEndpoint}>
                                            <Plus className="icon" />
                                            Create endpoint
                                        </button>
                                    </div>
                                ) : (
                                    <div className="endpoints-list">
                                        {sortedByRecent.map((endpoint) => {
                                            const active = isEndpointActive(endpoint);

                                            return (
                                                <article key={endpoint.id} className="endpoint-card">
                                                    <button className="endpoint-card-main" onClick={() => onSelectEndpoint(endpoint)}>
                                                        <div className={`endpoint-card-dot ${active ? 'active' : 'inactive'}`} />
                                                        <div className="endpoint-card-info">
                                                            <div className="endpoint-card-heading">
                                                                <div className="endpoint-card-name">{endpoint.name || `Endpoint ${endpoint.slug}`}</div>
                                                                <span className={`endpoint-card-chip ${active ? 'active' : 'inactive'}`}>
                                                                    {active ? 'Live' : 'Paused'}
                                                                </span>
                                                                {endpoint.forwarding_url && (
                                                                    <span className="endpoint-card-chip forwarding">Forwarding</span>
                                                                )}
                                                            </div>
                                                            <p className="endpoint-card-description">
                                                                {endpoint.description || 'Ready to capture, inspect, replay, and simulate webhook traffic.'}
                                                            </p>
                                                            <code className="endpoint-card-slug">{getWebhookUrl(endpoint.slug)}</code>
                                                            <div className="endpoint-card-meta">
                                                                <span>
                                                                    <Clock3 size={13} />
                                                                    {endpoint.last_request_at
                                                                        ? `Last hit ${formatTime(endpoint.last_request_at)}`
                                                                        : `Created ${formatTime(endpoint.created_at)}`}
                                                                </span>
                                                                <span>
                                                                    <Activity size={13} />
                                                                    {endpoint.request_count || 0} events captured
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </button>

                                                    <div className="endpoint-card-stats">
                                                        <div className="endpoint-card-stat">
                                                            <div className="endpoint-card-stat-value">{endpoint.request_count || 0}</div>
                                                            <div className="endpoint-card-stat-label">Requests</div>
                                                        </div>
                                                        <div className="endpoint-card-stat">
                                                            <div className="endpoint-card-stat-value">
                                                                {endpoint.last_request_at ? formatTime(endpoint.last_request_at) : 'Idle'}
                                                            </div>
                                                            <div className="endpoint-card-stat-label">Last Seen</div>
                                                        </div>
                                                    </div>

                                                    <div className="endpoint-card-actions">
                                                        <button className="btn btn-ghost btn-icon" onClick={() => onSelectEndpoint(endpoint)} title="Open endpoint">
                                                            <ArrowRight className="icon" size={16} />
                                                        </button>
                                                        <button className="btn btn-ghost btn-icon danger" onClick={() => onDeleteEndpoint(endpoint.id)} title="Delete endpoint">
                                                            <Trash2 className="icon" size={16} />
                                                        </button>
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {getSectionMode('dashboard.traffic') === 'collapsed' ? (
                            <CollapsedPanel
                                className="dashboard-panel"
                                kicker="Traffic"
                                title="Top webhook lanes"
                                summary={sortedByTraffic.length > 0
                                    ? `${sortedByTraffic[0].name || sortedByTraffic[0].slug} is leading current traffic.`
                                    : 'Traffic comparisons appear here after requests arrive.'}
                                mode={getSectionMode('dashboard.traffic')}
                                onChangeMode={(mode) => setSectionMode('dashboard.traffic', mode)}
                            />
                        ) : getSectionMode('dashboard.traffic') !== 'hidden' && (
                            <div className="dashboard-panel">
                                <div className="dashboard-panel-header">
                                    <div>
                                        <span className="dashboard-panel-kicker">Traffic</span>
                                        <h2>Top webhook lanes</h2>
                                    </div>
                                    <SectionVisibilityButtons
                                        mode={getSectionMode('dashboard.traffic')}
                                        onChangeMode={(mode) => setSectionMode('dashboard.traffic', mode)}
                                    />
                                </div>

                                {sortedByTraffic.length > 0 ? (
                                    <div className="dashboard-traffic-list">
                                        {sortedByTraffic.slice(0, 5).map((endpoint, index) => (
                                            <button
                                                key={endpoint.id}
                                                className="dashboard-traffic-row"
                                                onClick={() => onSelectEndpoint(endpoint)}
                                            >
                                                <div className="dashboard-traffic-rank">0{index + 1}</div>
                                                <div className="dashboard-traffic-info">
                                                    <strong>{endpoint.name || endpoint.slug}</strong>
                                                    <span>{endpoint.last_request_at ? `Last hit ${formatTime(endpoint.last_request_at)}` : 'Waiting for traffic'}</span>
                                                </div>
                                                <div className="dashboard-traffic-bar">
                                                    <span style={{ width: `${Math.max(8, ((endpoint.request_count || 0) / topTrafficBaseline) * 100)}%` }} />
                                                </div>
                                                <div className="dashboard-traffic-value">{endpoint.request_count || 0}</div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="dashboard-inline-empty">
                                        Traffic comparisons appear here once requests start flowing through your endpoints.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {(getSectionMode('dashboard.actions') !== 'hidden' || getSectionMode('dashboard.insights') !== 'hidden' || getSectionMode('dashboard.workflow') !== 'hidden') && (
                    <div className="dashboard-side-column">
                        {getSectionMode('dashboard.actions') === 'collapsed' ? (
                            <CollapsedPanel
                                className="dashboard-panel"
                                kicker="Actions"
                                title="Fast tracks"
                                summary="Keep shortcut actions available without keeping the full card stack open."
                                mode={getSectionMode('dashboard.actions')}
                                onChangeMode={(mode) => setSectionMode('dashboard.actions', mode)}
                            />
                        ) : getSectionMode('dashboard.actions') !== 'hidden' && (
                            <div className="dashboard-panel">
                                <div className="dashboard-panel-header">
                                    <div>
                                        <span className="dashboard-panel-kicker">Actions</span>
                                        <h2>Fast tracks</h2>
                                    </div>
                                    <SectionVisibilityButtons
                                        mode={getSectionMode('dashboard.actions')}
                                        onChangeMode={(mode) => setSectionMode('dashboard.actions', mode)}
                                    />
                                </div>

                                <div className="quick-actions">
                                    {quickActions.map((action) => (
                                        <button
                                            key={action.title}
                                            className={`quick-action-card ${action.disabled ? 'disabled' : ''}`}
                                            onClick={action.action}
                                            disabled={action.disabled}
                                        >
                                            <div className={`quick-action-icon ${action.tone}`}>
                                                <action.icon size={18} />
                                            </div>
                                            <h4>{action.title}</h4>
                                            <p>{action.copy}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {getSectionMode('dashboard.insights') === 'collapsed' ? (
                            <CollapsedPanel
                                className="dashboard-panel"
                                kicker="Insights"
                                title="Operating notes"
                                summary={`${operatingNotes.length} summary cards ready to reopen when needed.`}
                                mode={getSectionMode('dashboard.insights')}
                                onChangeMode={(mode) => setSectionMode('dashboard.insights', mode)}
                            />
                        ) : getSectionMode('dashboard.insights') !== 'hidden' && (
                            <div className="dashboard-panel">
                                <div className="dashboard-panel-header">
                                    <div>
                                        <span className="dashboard-panel-kicker">Insights</span>
                                        <h2>Operating notes</h2>
                                    </div>
                                    <SectionVisibilityButtons
                                        mode={getSectionMode('dashboard.insights')}
                                        onChangeMode={(mode) => setSectionMode('dashboard.insights', mode)}
                                    />
                                </div>

                                <div className="dashboard-insight-list">
                                    {operatingNotes.map((note) => (
                                        <div key={note.label} className="dashboard-insight-item">
                                            <div className="dashboard-insight-icon">
                                                <note.icon size={16} />
                                            </div>
                                            <div className="dashboard-insight-copy">
                                                <span>{note.label}</span>
                                                <strong>{note.value}</strong>
                                                <p>{note.note}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {getSectionMode('dashboard.workflow') === 'collapsed' ? (
                            <CollapsedPanel
                                className="dashboard-panel"
                                kicker="Workflow"
                                title="Recommended setup"
                                summary="Three practical steps for the standard webhook testing flow."
                                mode={getSectionMode('dashboard.workflow')}
                                onChangeMode={(mode) => setSectionMode('dashboard.workflow', mode)}
                            />
                        ) : getSectionMode('dashboard.workflow') !== 'hidden' && (
                            <div className="dashboard-panel">
                                <div className="dashboard-panel-header">
                                    <div>
                                        <span className="dashboard-panel-kicker">Workflow</span>
                                        <h2>Recommended setup</h2>
                                    </div>
                                    <SectionVisibilityButtons
                                        mode={getSectionMode('dashboard.workflow')}
                                        onChangeMode={(mode) => setSectionMode('dashboard.workflow', mode)}
                                    />
                                </div>

                                <div className="dashboard-checklist">
                                    <div className="dashboard-checklist-item">
                                        <strong>Capture first</strong>
                                        <p>Use named endpoints per provider so request history stays organized and searchable.</p>
                                    </div>
                                    <div className="dashboard-checklist-item">
                                        <strong>Monitor in real time</strong>
                                        <p>Open your busiest route during integration work so failures appear the moment they land.</p>
                                    </div>
                                    <div className="dashboard-checklist-item">
                                        <strong>Simulate downstream behavior</strong>
                                        <p>Test retries, delays, and mirror traffic to staging using forwarding plus custom responses.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}
