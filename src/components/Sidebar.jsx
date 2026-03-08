import {
    Activity,
    ArrowUpRight,
    Bookmark,
    Clock3,
    LayoutDashboard,
    Link2,
    LogOut,
    Moon,
    Plus,
    Radio,
    Settings2,
    ShieldCheck,
    Sparkles,
    Sun,
    Webhook,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../utils/api';

const isEndpointActive = (endpoint) => endpoint.is_active === 1 || endpoint.is_active === true;
const normalizeImportantValue = (value) => (typeof value === 'string' ? value.trim() : '');

const hasImportantContent = (item) => {
    const label = normalizeImportantValue(item?.label);
    const detail = normalizeImportantValue(item?.detail);
    const target = normalizeImportantValue(item?.target);

    if (item?.actionType === 'url') {
        return label || detail || target;
    }

    if (item?.actionType && item.actionType !== 'none') {
        return true;
    }

    return label || detail;
};
const getImportantTone = (item) => (typeof item?.tone === 'string' && item.tone ? item.tone : 'blue');
const normalizeQuickAccessUrl = (value) => {
    const normalizedValue = normalizeImportantValue(value);

    if (!normalizedValue) {
        return '';
    }

    return /^https?:\/\//i.test(normalizedValue) ? normalizedValue : `https://${normalizedValue}`;
};

const getQuickAccessMeta = (item, endpoints, selectedEndpoint) => {
    switch (item?.actionType) {
        case 'dashboard':
            return {
                label: 'Workspace overview',
                detail: 'Open the dashboard and summary view.',
                icon: LayoutDashboard,
                actionable: true,
            };
        case 'create':
            return {
                label: 'Create route',
                detail: 'Open the create endpoint flow.',
                icon: Plus,
                actionable: true,
            };
        case 'workspace-settings':
            return {
                label: 'Workspace settings',
                detail: 'Open density and sidebar controls.',
                icon: Settings2,
                actionable: true,
            };
        case 'selected-endpoint':
            return selectedEndpoint
                ? {
                    label: selectedEndpoint.name || selectedEndpoint.slug,
                    detail: `/hook/${selectedEndpoint.slug}`,
                    icon: Webhook,
                    actionable: true,
                }
                : {
                    label: 'Current endpoint',
                    detail: 'Open an endpoint first to use this shortcut.',
                    icon: Webhook,
                    actionable: false,
                };
        case 'response-studio':
            return selectedEndpoint
                ? {
                    label: 'Response studio',
                    detail: `Manage ${selectedEndpoint.name || selectedEndpoint.slug}`,
                    icon: ShieldCheck,
                    actionable: true,
                }
                : {
                    label: 'Response studio',
                    detail: 'Select an endpoint before opening response tools.',
                    icon: ShieldCheck,
                    actionable: false,
                };
        case 'endpoint': {
            const targetEndpoint = endpoints.find((endpoint) => String(endpoint.id) === String(item?.target) || endpoint.slug === item?.target);

            return targetEndpoint
                ? {
                    label: targetEndpoint.name || targetEndpoint.slug,
                    detail: `/hook/${targetEndpoint.slug}`,
                    icon: Webhook,
                    actionable: true,
                    endpoint: targetEndpoint,
                }
                : {
                    label: 'Saved endpoint',
                    detail: 'This endpoint is no longer available.',
                    icon: Webhook,
                    actionable: false,
                };
        }
        case 'url': {
            const normalizedUrl = normalizeQuickAccessUrl(item?.target);

            return {
                label: normalizedUrl || 'External link',
                detail: normalizedUrl || 'Add a valid URL to use this shortcut.',
                icon: Link2,
                actionable: Boolean(normalizedUrl),
                external: true,
                href: normalizedUrl,
            };
        }
        default:
            return {
                label: 'Pinned note',
                detail: 'Reference only',
                icon: Bookmark,
                actionable: false,
            };
    }
};

export default function Sidebar({
    currentUser,
    endpoints,
    selectedEndpoint,
    currentView,
    stats,
    theme,
    uiFontSize,
    sidebarSettings,
    importantItems,
    toggleTheme,
    isCompactLayout,
    isOpen,
    isOverlayMode,
    isCollapsed,
    onClose,
    onNavigate,
    onSelectEndpoint,
    onCreateEndpoint,
    onOpenWorkspaceSettings,
    onLogout,
}) {
    const [isImportantItemsOpen, setIsImportantItemsOpen] = useState(false);
    const importantItemsRef = useRef(null);
    const activeEndpoints = endpoints.filter(isEndpointActive).length;
    const leadingEndpoint = [...endpoints].sort((a, b) => (b.request_count || 0) - (a.request_count || 0))[0] || null;
    const recentEndpoints = [...endpoints]
        .sort((a, b) => new Date(b.last_request_at || b.created_at || 0) - new Date(a.last_request_at || a.created_at || 0))
        .slice(0, 6);
    const visibleImportantItems = importantItems.filter(hasImportantContent);

    useEffect(() => {
        if (!isCollapsed || !isImportantItemsOpen) {
            return undefined;
        }

        const handlePointerDown = (event) => {
            if (importantItemsRef.current && !importantItemsRef.current.contains(event.target)) {
                setIsImportantItemsOpen(false);
            }
        };

        window.addEventListener('pointerdown', handlePointerDown);

        return () => {
            window.removeEventListener('pointerdown', handlePointerDown);
        };
    }, [isCollapsed, isImportantItemsOpen]);

    const handleNavigate = (view) => {
        onNavigate(view);
    };

    const handleSelectRoute = (endpoint) => {
        onSelectEndpoint(endpoint);
    };

    const handleCreate = () => {
        onCreateEndpoint();
        if (isCompactLayout) {
            onClose();
        }
    };

    const handleLogout = () => {
        onLogout();
        if (isCompactLayout) {
            onClose();
        }
    };

    const handleOpenWorkspaceSettings = () => {
        setIsImportantItemsOpen(false);
        onOpenWorkspaceSettings();
    };

    const handleQuickAccess = (item) => {
        const quickAccessMeta = getQuickAccessMeta(item, endpoints, selectedEndpoint);

        if (!quickAccessMeta.actionable) {
            return;
        }

        setIsImportantItemsOpen(false);

        switch (item.actionType) {
            case 'dashboard':
                handleNavigate('dashboard');
                break;
            case 'create':
                handleCreate();
                break;
            case 'workspace-settings':
                handleOpenWorkspaceSettings();
                break;
            case 'selected-endpoint':
                if (selectedEndpoint) {
                    handleSelectRoute(selectedEndpoint);
                }
                break;
            case 'response-studio':
                if (selectedEndpoint) {
                    handleNavigate('settings');
                }
                break;
            case 'endpoint':
                if (quickAccessMeta.endpoint) {
                    handleSelectRoute(quickAccessMeta.endpoint);
                }
                break;
            case 'url':
                if (quickAccessMeta.href) {
                    window.open(quickAccessMeta.href, '_blank', 'noopener,noreferrer');
                    if (isCompactLayout) {
                        onClose();
                    }
                }
                break;
            default:
                break;
        }
    };

    const renderQuickAccessItem = (item) => {
        const quickAccessMeta = getQuickAccessMeta(item, endpoints, selectedEndpoint);
        const ActionIcon = quickAccessMeta.external ? ArrowUpRight : quickAccessMeta.icon;
        const itemTitle = normalizeImportantValue(item.label) || quickAccessMeta.label;
        const itemDetail = normalizeImportantValue(item.detail) || quickAccessMeta.detail;
        const toneClass = `tone-${getImportantTone(item)}`;
        const itemContent = (
            <>
                <div className={`sidebar-important-icon ${toneClass}`}>
                    <ActionIcon size={13} />
                </div>
                <div className="sidebar-important-copy">
                    <strong>{itemTitle}</strong>
                    {itemDetail && <span>{itemDetail}</span>}
                </div>
            </>
        );

        if (quickAccessMeta.actionable) {
            return (
                <button
                    key={item.id}
                    className={`sidebar-important-item sidebar-important-item-button ${toneClass}`}
                    onClick={() => handleQuickAccess(item)}
                    aria-label={itemTitle}
                >
                    {itemContent}
                </button>
            );
        }

        return (
            <div key={item.id} className={`sidebar-important-item sidebar-important-item-static ${toneClass}`}>
                {itemContent}
            </div>
        );
    };

    return (
        <aside
            className={[
                'sidebar',
                isCompactLayout ? 'sidebar-compact' : '',
                isOpen ? 'open' : '',
                isOverlayMode ? 'sidebar-overlay-mode' : '',
                isCollapsed ? 'sidebar-collapsed' : '',
            ].filter(Boolean).join(' ')}
        >
            <div className="sidebar-header">
                <div className="sidebar-header-row">
                    <button className="sidebar-logo" onClick={() => handleNavigate('dashboard')} aria-label="Workspace overview" data-label="HookRadar">
                        <div className="sidebar-logo-icon">
                            <Webhook className="sidebar-logo-glyph" />
                        </div>
                        <div>
                            <div className="sidebar-logo-text">HookRadar</div>
                            <span className="sidebar-logo-badge">Control deck</span>
                        </div>
                    </button>

                    {isOverlayMode && (
                        <button className="sidebar-close" onClick={onClose} aria-label="Close navigation">
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>

            <div className="sidebar-nav">
                <div className="sidebar-workspace-card">
                    <div className="sidebar-workspace-header">
                        <span>Workspace pulse</span>
                        <strong>{stats.requests_today} today</strong>
                    </div>

                    <div className="sidebar-stats">
                        <div className="sidebar-stat">
                            <div className="sidebar-stat-value">{stats.total_endpoints}</div>
                            <div className="sidebar-stat-label">Routes</div>
                        </div>
                        <div className="sidebar-stat">
                            <div className="sidebar-stat-value">{stats.total_requests}</div>
                            <div className="sidebar-stat-label">Events</div>
                        </div>
                        <div className="sidebar-stat">
                            <div className="sidebar-stat-value">{activeEndpoints}</div>
                            <div className="sidebar-stat-label">Live</div>
                        </div>
                    </div>

                    {leadingEndpoint ? (
                        <div className="sidebar-workspace-copy">
                            <Sparkles size={14} />
                            <span>{leadingEndpoint.name || leadingEndpoint.slug} is currently your busiest endpoint.</span>
                        </div>
                    ) : (
                        <div className="sidebar-workspace-copy">
                            <Radio size={14} />
                            <span>Create a route to start receiving live webhook traffic.</span>
                        </div>
                    )}

                    <button className="sidebar-primary-link" onClick={handleCreate}>
                        <Plus className="icon" />
                        New endpoint
                    </button>
                </div>

                <div className="sidebar-section-title">Navigate</div>

                <button
                    className={`sidebar-link ${currentView === 'dashboard' ? 'active' : ''}`}
                    onClick={() => handleNavigate('dashboard')}
                    aria-label="Workspace overview"
                    data-label="Workspace overview"
                >
                    <LayoutDashboard className="icon" />
                    <span>Workspace overview</span>
                </button>

                <button className="sidebar-link" onClick={handleCreate} aria-label="Create route" data-label="Create route">
                    <Plus className="icon" />
                    <span>Create route</span>
                </button>

                {isCollapsed && (
                    <div className="sidebar-collapsed-popout-anchor" ref={importantItemsRef}>
                        <button
                            className={`sidebar-link ${isImportantItemsOpen ? 'active' : ''}`}
                            onClick={() => setIsImportantItemsOpen((previous) => !previous)}
                            aria-label="Quick access"
                            data-label="Quick access"
                        >
                            <Bookmark className="icon" />
                            <span>Quick access</span>
                            {visibleImportantItems.length > 0 && <span className="sidebar-link-badge">{visibleImportantItems.length}</span>}
                        </button>

                        <div className={`sidebar-popout ${isImportantItemsOpen ? 'visible' : ''}`}>
                            <div className="sidebar-popout-header">
                                <strong>Quick access</strong>
                                <span>{visibleImportantItems.length > 0 ? `${visibleImportantItems.length} saved` : 'Empty'}</span>
                            </div>

                            {visibleImportantItems.length > 0 ? (
                                <div className="sidebar-important-list sidebar-important-list-popout">
                                    {visibleImportantItems.map(renderQuickAccessItem)}
                                </div>
                            ) : (
                                <button className="sidebar-important-empty" onClick={handleOpenWorkspaceSettings}>
                                    <Bookmark size={14} />
                                    Add shortcuts, URLs, or reminders
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {selectedEndpoint && (
                    <button
                        className={`sidebar-link ${currentView === 'settings' ? 'active' : ''}`}
                        onClick={() => handleNavigate('settings')}
                        aria-label="Response studio"
                        data-label="Response studio"
                    >
                        <ShieldCheck className="icon" />
                        <span>Response studio</span>
                    </button>
                )}

                <div className="sidebar-section-title">
                    Hot routes
                    <span className="sidebar-link-badge">{endpoints.length}</span>
                </div>

                <div className="sidebar-endpoints">
                    {recentEndpoints.length === 0 ? (
                        <div className="sidebar-empty-copy">
                            No endpoints yet. Build one to start the live request stream.
                        </div>
                    ) : (
                        recentEndpoints.map((endpoint) => {
                            const active = isEndpointActive(endpoint);

                            return (
                                <button
                                    key={endpoint.id}
                                    className={`sidebar-endpoint-item ${selectedEndpoint?.id === endpoint.id ? 'active' : ''}`}
                                    onClick={() => handleSelectRoute(endpoint)}
                                    aria-label={endpoint.name || endpoint.slug}
                                    data-label={endpoint.name || endpoint.slug}
                                >
                                    <div className={`sidebar-endpoint-dot ${active ? '' : 'inactive'}`} />
                                    <div className="sidebar-endpoint-copy">
                                        <span className="sidebar-endpoint-slug">{endpoint.name || endpoint.slug}</span>
                                        <span className="sidebar-endpoint-meta">
                                            {endpoint.last_request_at
                                                ? `Last hit ${formatTime(endpoint.last_request_at)}`
                                                : `Created ${formatTime(endpoint.created_at)}`}
                                        </span>
                                    </div>
                                    <span className="sidebar-endpoint-count">{endpoint.request_count || 0}</span>
                                </button>
                            );
                        })
                    )}
                </div>

                {!isCollapsed && (
                    <>
                        <div className="sidebar-section-title">
                            Quick access
                            <span className="sidebar-link-badge">{visibleImportantItems.length}</span>
                        </div>

                        {visibleImportantItems.length > 0 ? (
                            <div className="sidebar-important-list">
                                {visibleImportantItems.map(renderQuickAccessItem)}
                            </div>
                        ) : (
                            <button className="sidebar-important-empty" onClick={handleOpenWorkspaceSettings}>
                                <Bookmark size={14} />
                                Save one-click shortcuts, direct links, or anything important for the workspace.
                            </button>
                        )}
                    </>
                )}

                <div className="sidebar-bottom-section">
                    <div className="sidebar-account-card">
                        <div className="sidebar-account-label">Signed in as</div>
                        <div className="sidebar-account-name">{currentUser.name || currentUser.email}</div>
                        <div className="sidebar-account-email">{currentUser.email}</div>
                        <div className="sidebar-account-plan">{currentUser.plan || 'free'} plan</div>
                        {selectedEndpoint && (
                            <div className="sidebar-account-context">
                                <Activity size={14} />
                                <span>{selectedEndpoint.name || selectedEndpoint.slug} is open in the workspace.</span>
                            </div>
                        )}
                    </div>

                    <div className="sidebar-account-actions">
                        <button className="sidebar-link" onClick={handleOpenWorkspaceSettings} aria-label="Workspace settings" data-label="Workspace settings">
                            <Settings2 className="icon" />
                            <span>Workspace settings</span>
                            <span className="sidebar-link-value">{uiFontSize}px • {sidebarSettings.width}px</span>
                        </button>

                        <button
                            className="sidebar-link"
                            onClick={toggleTheme}
                            aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                            data-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                        >
                            {theme === 'dark' ? <Sun className="icon" /> : <Moon className="icon" />}
                            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
                        </button>

                        <button className="sidebar-link" onClick={handleLogout} aria-label="Sign out" data-label="Sign out">
                            <LogOut className="icon" />
                            <span>Sign out</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="sidebar-footer">
                <div className="sidebar-footer-copy">
                    <Clock3 size={14} />
                    <span>{leadingEndpoint?.last_request_at ? `Last event ${formatTime(leadingEndpoint.last_request_at)}` : 'Waiting for the first event'}</span>
                </div>
            </div>
        </aside>
    );
}
