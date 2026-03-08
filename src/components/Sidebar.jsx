import {
    Activity,
    Bookmark,
    Clock3,
    LayoutDashboard,
    LogOut,
    Moon,
    Plus,
    Radio,
    Settings2,
    ShieldCheck,
    Sparkles,
    Sun,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import BrandMark from './BrandMark';
import { formatTime } from '../utils/api';
import {
    cleanImportantValue,
    getQuickAccessIcon,
    getQuickAccessMeta,
    isQuickAccessConfigured,
} from '../utils/quickAccess';

const isEndpointActive = (endpoint) => endpoint.is_active === 1 || endpoint.is_active === true;
const getImportantTone = (item) => (typeof item?.tone === 'string' && item.tone ? item.tone : 'blue');

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
    const visibleImportantItems = importantItems.filter(isQuickAccessConfigured);

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

    const handleQuickAccess = async (item) => {
        const quickAccessMeta = getQuickAccessMeta(item, endpoints, selectedEndpoint);

        if (!quickAccessMeta.actionable) {
            return;
        }

        setIsImportantItemsOpen(false);

        if (item.interaction === 'copy' && quickAccessMeta.copyValue) {
            try {
                await navigator.clipboard.writeText(quickAccessMeta.copyValue);
                toast.success('Shortcut URL copied');
                if (isCompactLayout) {
                    onClose();
                }
            } catch {
                toast.error('Failed to copy shortcut URL');
            }
            return;
        }

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
                    if (item.openMode === 'same-tab') {
                        window.location.assign(quickAccessMeta.href);
                    } else {
                        window.open(quickAccessMeta.href, '_blank', 'noopener,noreferrer');
                        if (isCompactLayout) {
                            onClose();
                        }
                    }
                }
                break;
            default:
                break;
        }
    };

    const renderQuickAccessItem = (item) => {
        const quickAccessMeta = getQuickAccessMeta(item, endpoints, selectedEndpoint);
        const ActionIcon = getQuickAccessIcon(item.icon, quickAccessMeta.icon);
        const itemTitle = cleanImportantValue(item.label) || quickAccessMeta.label;
        const itemDetail = cleanImportantValue(item.detail) || quickAccessMeta.detail;
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
                            <BrandMark size={28} className="sidebar-logo-glyph" />
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
