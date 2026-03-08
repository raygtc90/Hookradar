import {
    ArrowDown,
    ArrowUpRight,
    ArrowUp,
    Bookmark,
    Blocks,
    Check,
    GripVertical,
    LayoutDashboard,
    Lock,
    MonitorCog,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightOpen,
    Plus,
    RotateCcw,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    Webhook,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    defaultSectionPreferences,
    layoutSectionGroups,
    layoutSectionOptions,
    normalizeSectionPreferences,
} from '../utils/layoutPreferences';

const fontSizePresets = [
    { value: 10, label: 'Ultra compact', description: 'Maximum density for large screens' },
    { value: 11, label: 'Compact', description: 'Current tight layout' },
    { value: 12, label: 'Balanced', description: 'Slightly roomier while still dense' },
    { value: 13, label: 'Comfort', description: 'More breathing room' },
    { value: 14, label: 'Spacious', description: 'Bigger text and controls' },
];

const sidebarModes = [
    {
        value: 'expanded',
        label: 'Expanded',
        description: 'Full desktop sidebar with complete content visible.',
        icon: PanelLeftOpen,
    },
    {
        value: 'collapsed',
        label: 'Collapsed',
        description: 'Slim icon rail to save horizontal space.',
        icon: PanelLeftClose,
    },
    {
        value: 'hidden',
        label: 'Hidden',
        description: 'Keep the sidebar off-canvas and open it only when needed.',
        icon: PanelRightOpen,
    },
];

const sidebarWidthPresets = [236, 264, 300, 336];
const importantItemTones = [
    { value: 'blue', label: 'Info' },
    { value: 'green', label: 'Live' },
    { value: 'orange', label: 'Warning' },
    { value: 'purple', label: 'Priority' },
    { value: 'cyan', label: 'Link' },
    { value: 'red', label: 'Critical' },
];
const quickAccessActions = [
    { value: 'none', label: 'Note only', description: 'Keep a pinned reference without navigation.' },
    { value: 'dashboard', label: 'Workspace overview', description: 'Jump to the dashboard.' },
    { value: 'create', label: 'Create route', description: 'Open the create endpoint modal.' },
    { value: 'workspace-settings', label: 'Workspace settings', description: 'Open the settings modal.' },
    { value: 'selected-endpoint', label: 'Current endpoint', description: 'Open the endpoint currently active in the workspace.' },
    { value: 'response-studio', label: 'Current response studio', description: 'Jump into response tools for the current endpoint.' },
    { value: 'endpoint', label: 'Specific endpoint', description: 'Open a saved endpoint directly.' },
    { value: 'url', label: 'External URL', description: 'Open an external link in one click.' },
];
const defaultImportantItems = Array.from({ length: 4 }, (_, index) => ({
    id: `important-${index + 1}`,
    label: '',
    detail: '',
    tone: importantItemTones[index % importantItemTones.length].value,
    actionType: 'none',
    target: '',
}));

function clampFontSize(value) {
    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
        return 11;
    }

    return Math.min(16, Math.max(10, parsed));
}

function clampSidebarWidth(value) {
    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
        return 264;
    }

    return Math.min(360, Math.max(220, parsed));
}

function normalizeSidebarMode(value) {
    return ['expanded', 'collapsed', 'hidden'].includes(value) ? value : 'expanded';
}

function normalizeImportantTone(value, index = 0) {
    return importantItemTones.some((tone) => tone.value === value)
        ? value
        : importantItemTones[index % importantItemTones.length].value;
}

function normalizeQuickAccessActionType(value) {
    return quickAccessActions.some((action) => action.value === value) ? value : 'none';
}

function normalizeImportantItem(value = {}, index = 0) {
    return {
        id: typeof value.id === 'string' && value.id.trim() ? value.id : `important-${index + 1}`,
        label: typeof value.label === 'string' ? value.label.slice(0, 48) : '',
        detail: typeof value.detail === 'string' ? value.detail.slice(0, 180) : '',
        tone: normalizeImportantTone(value.tone, index),
        actionType: normalizeQuickAccessActionType(value.actionType),
        target: typeof value.target === 'string' ? value.target.slice(0, 240) : '',
    };
}

function normalizeImportantItems(value = []) {
    return defaultImportantItems.map((fallback, index) => normalizeImportantItem(value[index] ?? fallback, index));
}

function cleanImportantValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function getImportantItemTone(item) {
    return normalizeImportantTone(item?.tone);
}

function normalizeQuickAccessUrl(value) {
    const normalizedValue = cleanImportantValue(value);

    if (!normalizedValue) {
        return '';
    }

    return /^https?:\/\//i.test(normalizedValue) ? normalizedValue : `https://${normalizedValue}`;
}

function isQuickAccessConfigured(item) {
    const label = cleanImportantValue(item?.label);
    const detail = cleanImportantValue(item?.detail);
    const target = cleanImportantValue(item?.target);

    if (item?.actionType === 'url') {
        return Boolean(label || detail || target);
    }

    if (item?.actionType && item.actionType !== 'none') {
        return true;
    }

    return Boolean(label || detail);
}

function getQuickAccessMeta(item, endpoints, selectedEndpoint) {
    switch (item?.actionType) {
        case 'dashboard':
            return {
                label: 'Workspace overview',
                detail: 'Jump to the dashboard and recent activity.',
                icon: LayoutDashboard,
                actionable: true,
            };
        case 'create':
            return {
                label: 'Create route',
                detail: 'Open the endpoint creation flow instantly.',
                icon: Plus,
                actionable: true,
            };
        case 'workspace-settings':
            return {
                label: 'Workspace settings',
                detail: 'Open interface and sidebar controls.',
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
                    detail: 'Select an endpoint before using this shortcut.',
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
                }
                : {
                    label: 'Specific endpoint',
                    detail: 'Choose an endpoint to make this shortcut work.',
                    icon: Webhook,
                    actionable: false,
                };
        }
        case 'url': {
            const normalizedUrl = normalizeQuickAccessUrl(item?.target);

            return {
                label: normalizedUrl || 'External URL',
                detail: normalizedUrl || 'Add a URL to make this shortcut work.',
                icon: ArrowUpRight,
                actionable: Boolean(normalizedUrl),
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
}

export default function WorkspaceSettingsModal({
    currentFontSize,
    currentSectionPreferences,
    currentSidebarSettings,
    currentImportantItems,
    endpoints,
    selectedEndpoint,
    onClose,
    onApply,
}) {
    const [activeSection, setActiveSection] = useState('display');
    const [draftFontSize, setDraftFontSize] = useState(String(currentFontSize));
    const [draftSidebarWidth, setDraftSidebarWidth] = useState(String(currentSidebarSettings.width));
    const [draftSidebarMode, setDraftSidebarMode] = useState(currentSidebarSettings.mode);
    const [draftSidebarAutoClose, setDraftSidebarAutoClose] = useState(Boolean(currentSidebarSettings.autoClose));
    const [draftSidebarLockOpen, setDraftSidebarLockOpen] = useState(Boolean(currentSidebarSettings.lockOpen));
    const [draftImportantItems, setDraftImportantItems] = useState(() => normalizeImportantItems(currentImportantItems));
    const [draftSectionPreferences, setDraftSectionPreferences] = useState(() => normalizeSectionPreferences(currentSectionPreferences));
    const [draggedImportantIndex, setDraggedImportantIndex] = useState(null);

    useEffect(() => {
        setDraftFontSize(String(currentFontSize));
    }, [currentFontSize]);

    useEffect(() => {
        setDraftSidebarWidth(String(currentSidebarSettings.width));
        setDraftSidebarMode(currentSidebarSettings.mode);
        setDraftSidebarAutoClose(Boolean(currentSidebarSettings.autoClose));
        setDraftSidebarLockOpen(Boolean(currentSidebarSettings.lockOpen));
    }, [currentSidebarSettings]);

    useEffect(() => {
        setDraftImportantItems(normalizeImportantItems(currentImportantItems));
    }, [currentImportantItems]);

    useEffect(() => {
        setDraftSectionPreferences(normalizeSectionPreferences(currentSectionPreferences));
    }, [currentSectionPreferences]);

    const normalizedFontSize = clampFontSize(draftFontSize);
    const normalizedSidebarWidth = clampSidebarWidth(draftSidebarWidth);
    const normalizedSidebarMode = normalizeSidebarMode(draftSidebarMode);
    const visibleImportantItems = draftImportantItems.filter(isQuickAccessConfigured);
    const normalizedSectionPreferences = normalizeSectionPreferences(draftSectionPreferences);
    const hiddenSectionCount = Object.values(normalizedSectionPreferences).filter((value) => value === 'hidden').length;
    const collapsedSectionCount = Object.values(normalizedSectionPreferences).filter((value) => value === 'collapsed').length;

    const sectionTabs = [
        {
            value: 'display',
            label: 'Display size',
            description: 'Density and scale',
            summary: `${normalizedFontSize}px`,
            icon: SlidersHorizontal,
        },
        {
            value: 'sidebar',
            label: 'Sidebar mode',
            description: 'Layout and behavior',
            summary: normalizedSidebarMode,
            icon: PanelLeftOpen,
        },
        {
            value: 'layout',
            label: 'Cards & panels',
            description: 'Section visibility',
            summary: `${collapsedSectionCount} collapsed • ${hiddenSectionCount} hidden`,
            icon: Blocks,
        },
        {
            value: 'important',
            label: 'Quick access',
            description: 'Shortcuts and saved links',
            summary: `${visibleImportantItems.length} saved`,
            icon: Bookmark,
        },
    ];

    const handleImportantItemChange = (index, field, value) => {
        const nextValue = field === 'tone' || field === 'actionType'
            ? value
            : value.slice(0, field === 'label' ? 48 : field === 'target' ? 240 : 180);

        setDraftImportantItems((previous) => (
            previous.map((item, itemIndex) => (
                itemIndex === index
                    ? {
                        ...item,
                        [field]: nextValue,
                    }
                    : item
            ))
        ));
    };

    const moveImportantItem = (fromIndex, toIndex) => {
        if (toIndex < 0 || toIndex >= draftImportantItems.length || fromIndex === toIndex) {
            return;
        }

        setDraftImportantItems((previous) => {
            const nextItems = [...previous];
            const [movedItem] = nextItems.splice(fromIndex, 1);

            nextItems.splice(toIndex, 0, movedItem);

            return nextItems;
        });
    };

    const handleImportantDragStart = (index) => {
        setDraggedImportantIndex(index);
    };

    const handleImportantDrop = (targetIndex) => {
        if (draggedImportantIndex === null) {
            return;
        }

        moveImportantItem(draggedImportantIndex, targetIndex);
        setDraggedImportantIndex(null);
    };

    const handleImportantDragEnd = () => {
        setDraggedImportantIndex(null);
    };

    const handleSectionPreferenceChange = (sectionId, value) => {
        setDraftSectionPreferences((previous) => ({
            ...previous,
            [sectionId]: value,
        }));
    };

    const applyAllSectionPreferences = (value) => {
        setDraftSectionPreferences(() => (
            Object.keys(defaultSectionPreferences).reduce((accumulator, sectionId) => {
                accumulator[sectionId] = value;
                return accumulator;
            }, {})
        ));
    };

    const handleApply = () => {
        onApply({
            fontSize: normalizedFontSize,
            sidebar: {
                width: normalizedSidebarWidth,
                mode: normalizedSidebarMode,
                autoClose: draftSidebarAutoClose,
                lockOpen: draftSidebarLockOpen,
            },
            importantItems: normalizeImportantItems(draftImportantItems),
            sectionPreferences: normalizedSectionPreferences,
        });
        onClose();
    };

    const handleReset = () => {
        setActiveSection('display');
        setDraftFontSize('11');
        setDraftSidebarWidth('264');
        setDraftSidebarMode('expanded');
        setDraftSidebarAutoClose(true);
        setDraftSidebarLockOpen(false);
        setDraftImportantItems(defaultImportantItems);
        setDraftSectionPreferences(defaultSectionPreferences);
        setDraggedImportantIndex(null);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-wide" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-title-group">
                        <div className="modal-title-icon">
                            <MonitorCog size={18} />
                        </div>
                        <div>
                            <h2>Workspace settings</h2>
                            <p>Keep display controls, sidebar behavior, card visibility, and quick shortcuts organized in dedicated sections.</p>
                        </div>
                    </div>

                    <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close workspace settings">
                        <X className="icon" />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="workspace-settings-shell">
                        <div className="workspace-settings-nav">
                            {sectionTabs.map((section) => (
                                <button
                                    key={section.value}
                                    className={`workspace-settings-nav-button ${activeSection === section.value ? 'active' : ''}`}
                                    onClick={() => setActiveSection(section.value)}
                                >
                                    <div className="workspace-settings-nav-icon">
                                        <section.icon size={16} />
                                    </div>
                                    <div className="workspace-settings-nav-copy">
                                        <strong>{section.label}</strong>
                                        <span>{section.description}</span>
                                    </div>
                                    <div className="workspace-settings-nav-value">{section.summary}</div>
                                </button>
                            ))}
                        </div>

                        {activeSection === 'display' && (
                            <div className="workspace-settings-panel">
                                <div className="workspace-settings-panel-header">
                                    <div>
                                        <div className="display-settings-header">
                                            <SlidersHorizontal size={15} />
                                            Display size
                                        </div>
                                        <h3>Set the base scale of the full interface</h3>
                                        <p>Choose how compact or spacious the workspace feels at 100% browser zoom.</p>
                                    </div>
                                    <div className="workspace-settings-panel-badge">{normalizedFontSize}px</div>
                                </div>

                                <div className="display-settings-grid display-settings-grid-single">
                                    <div className="display-settings-section display-settings-surface">
                                        <div className="display-settings-options">
                                            {fontSizePresets.map((preset) => (
                                                <button
                                                    key={preset.value}
                                                    className={`display-option ${normalizedFontSize === preset.value ? 'active' : ''}`}
                                                    onClick={() => setDraftFontSize(String(preset.value))}
                                                >
                                                    <div className="display-option-header">
                                                        <strong>{preset.value}px</strong>
                                                        {normalizedFontSize === preset.value && <Check size={14} />}
                                                    </div>
                                                    <span>{preset.label}</span>
                                                    <p>{preset.description}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="display-settings-section display-settings-surface">
                                        <div className="display-custom-card">
                                            <div className="form-group">
                                                <label className="form-label">Base UI size (px)</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    min="10"
                                                    max="16"
                                                    step="1"
                                                    value={draftFontSize}
                                                    onChange={(event) => setDraftFontSize(event.target.value)}
                                                />
                                                <div className="form-hint">Allowed range: 10px to 16px.</div>
                                            </div>

                                            <div className="display-preview-card">
                                                <span>Current preview</span>
                                                <strong>{normalizedFontSize}px</strong>
                                                <p>Applied as the global base size for cards, type, inputs, and layout rhythm.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'sidebar' && (
                            <div className="workspace-settings-panel">
                                <div className="workspace-settings-panel-header">
                                    <div>
                                        <div className="display-settings-header">
                                            <PanelLeftOpen size={15} />
                                            Sidebar mode
                                        </div>
                                        <h3>Control how the workspace rail behaves</h3>
                                        <p>Keep navigation expanded, collapse it into an icon rail, or move it off-canvas with overlay controls.</p>
                                    </div>
                                    <div className="workspace-settings-panel-badge">{normalizedSidebarMode}</div>
                                </div>

                                <div className="display-settings-grid">
                                    <div className="display-settings-section display-settings-surface">
                                        <div className="display-settings-header">
                                            <PanelLeftOpen size={15} />
                                            Sidebar mode
                                        </div>

                                        <div className="display-settings-options">
                                            {sidebarModes.map((mode) => (
                                                <button
                                                    key={mode.value}
                                                    className={`display-option ${normalizedSidebarMode === mode.value ? 'active' : ''}`}
                                                    onClick={() => setDraftSidebarMode(mode.value)}
                                                >
                                                    <div className="display-option-header">
                                                        <strong>{mode.label}</strong>
                                                        <mode.icon size={15} />
                                                    </div>
                                                    <span>{mode.value}</span>
                                                    <p>{mode.description}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="display-settings-section display-settings-surface">
                                        <div className="display-settings-header">
                                            <PanelLeftClose size={15} />
                                            Sidebar width
                                        </div>

                                        <div className="display-custom-card">
                                            <div className="sidebar-width-header">
                                                <span>Desktop width</span>
                                                <strong>{normalizedSidebarWidth}px</strong>
                                            </div>

                                            <input
                                                type="range"
                                                className="sidebar-width-slider"
                                                min="220"
                                                max="360"
                                                step="4"
                                                value={normalizedSidebarWidth}
                                                onChange={(event) => setDraftSidebarWidth(event.target.value)}
                                            />

                                            <div className="sidebar-width-presets">
                                                {sidebarWidthPresets.map((width) => (
                                                    <button
                                                        key={width}
                                                        className={`sidebar-width-preset ${normalizedSidebarWidth === width ? 'active' : ''}`}
                                                        onClick={() => setDraftSidebarWidth(String(width))}
                                                    >
                                                        {width}px
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="form-group">
                                                <label className="form-label">Custom width</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    min="220"
                                                    max="360"
                                                    step="1"
                                                    value={draftSidebarWidth}
                                                    onChange={(event) => setDraftSidebarWidth(event.target.value)}
                                                />
                                                <div className="form-hint">Used for desktop expanded mode and hidden drawer width.</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="display-settings-section display-settings-surface display-settings-span-full">
                                        <div className="display-settings-header">
                                            <Lock size={15} />
                                            Sidebar behavior
                                        </div>

                                        <div className="settings-toggle-list">
                                            <div className="settings-toggle-card">
                                                <div>
                                                    <strong>Auto-close on navigation</strong>
                                                    <p>When the sidebar is opened as an overlay, close it automatically after route changes.</p>
                                                </div>
                                                <label className="toggle-switch">
                                                    <input
                                                        type="checkbox"
                                                        checked={draftSidebarAutoClose}
                                                        onChange={(event) => setDraftSidebarAutoClose(event.target.checked)}
                                                    />
                                                    <span className="toggle-slider" />
                                                </label>
                                            </div>

                                            <div className="settings-toggle-card">
                                                <div>
                                                    <strong>Lock sidebar open</strong>
                                                    <p>Keep overlay sidebar open until you manually close it. This overrides auto-close.</p>
                                                </div>
                                                <label className="toggle-switch">
                                                    <input
                                                        type="checkbox"
                                                        checked={draftSidebarLockOpen}
                                                        onChange={(event) => setDraftSidebarLockOpen(event.target.checked)}
                                                    />
                                                    <span className="toggle-slider" />
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'layout' && (
                            <div className="workspace-settings-panel">
                                <div className="workspace-settings-panel-header">
                                    <div>
                                        <div className="display-settings-header">
                                            <Blocks size={15} />
                                            Cards and panels
                                        </div>
                                        <h3>Choose which sections stay open, collapse down, or disappear entirely</h3>
                                        <p>These preferences apply across the dashboard, endpoint workspace, and Response Studio. Hidden sections can still be restored from the page itself.</p>
                                    </div>
                                    <div className="workspace-settings-panel-badge">{collapsedSectionCount} collapsed • {hiddenSectionCount} hidden</div>
                                </div>

                                <div className="display-settings-section display-settings-surface">
                                    <div className="layout-section-toolbar">
                                        <button type="button" className="sidebar-width-preset" onClick={() => applyAllSectionPreferences('expanded')}>
                                            Expand all
                                        </button>
                                        <button type="button" className="sidebar-width-preset" onClick={() => applyAllSectionPreferences('collapsed')}>
                                            Collapse all
                                        </button>
                                        <button type="button" className="sidebar-width-preset" onClick={() => applyAllSectionPreferences('hidden')}>
                                            Hide all
                                        </button>
                                    </div>
                                </div>

                                <div className="display-settings-grid">
                                    {layoutSectionGroups.map((group) => (
                                        <div key={group.id} className="display-settings-section display-settings-surface">
                                            <div className="layout-section-group-header">
                                                <div>
                                                    <div className="display-settings-header">{group.label}</div>
                                                    <strong>{group.description}</strong>
                                                </div>
                                                <span className="workspace-settings-panel-badge">{group.sections.length} sections</span>
                                            </div>

                                            <div className="layout-section-list">
                                                {group.sections.map((section) => (
                                                    <div key={section.id} className="layout-section-item">
                                                        <div className="layout-section-item-copy">
                                                            <strong>{section.label}</strong>
                                                            <p>{section.description}</p>
                                                        </div>

                                                        <div className="layout-section-option-row">
                                                            {layoutSectionOptions.map((option) => (
                                                                <button
                                                                    key={option.value}
                                                                    type="button"
                                                                    className={`layout-section-option ${normalizedSectionPreferences[section.id] === option.value ? 'active' : ''}`}
                                                                    onClick={() => handleSectionPreferenceChange(section.id, option.value)}
                                                                    title={option.description}
                                                                >
                                                                    {option.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeSection === 'important' && (
                            <div className="workspace-settings-panel">
                                <div className="workspace-settings-panel-header">
                                    <div>
                                        <div className="display-settings-header">
                                            <Bookmark size={15} />
                                            Quick access
                                        </div>
                                        <h3>Build one-click shortcuts for anything you need often</h3>
                                        <p>Save direct jumps to pages, endpoints, response controls, external tools, or plain notes that stay visible in the sidebar.</p>
                                    </div>
                                    <div className="workspace-settings-panel-badge">{visibleImportantItems.length} saved</div>
                                </div>

                                <div className="display-settings-grid">
                                    <div className="display-settings-section display-settings-surface">
                                        <div className="important-items-grid">
                                            {draftImportantItems.map((item, index) => (
                                                (() => {
                                                    const quickAccessMeta = getQuickAccessMeta(item, endpoints, selectedEndpoint);

                                                    return (
                                                        <div
                                                            key={item.id}
                                                            className={`important-item-editor tone-${getImportantItemTone(item)} ${draggedImportantIndex === index ? 'dragging' : ''}`}
                                                            draggable
                                                            onDragStart={() => handleImportantDragStart(index)}
                                                            onDragOver={(event) => event.preventDefault()}
                                                            onDrop={() => handleImportantDrop(index)}
                                                            onDragEnd={handleImportantDragEnd}
                                                        >
                                                            <div className="important-item-editor-header">
                                                                <div className="important-item-editor-title">
                                                                    <span className="important-item-grip" aria-hidden="true">
                                                                        <GripVertical size={14} />
                                                                    </span>
                                                                    <strong>Shortcut {index + 1}</strong>
                                                                </div>

                                                                <div className="important-item-editor-actions">
                                                                    <span>{isQuickAccessConfigured(item) ? (quickAccessMeta.actionable ? 'Ready' : 'Setup') : 'Empty'}</span>
                                                                    <button
                                                                        type="button"
                                                                        className="important-item-action"
                                                                        onClick={() => moveImportantItem(index, index - 1)}
                                                                        disabled={index === 0}
                                                                        aria-label={`Move shortcut ${index + 1} up`}
                                                                    >
                                                                        <ArrowUp size={14} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="important-item-action"
                                                                        onClick={() => moveImportantItem(index, index + 1)}
                                                                        disabled={index === draftImportantItems.length - 1}
                                                                        aria-label={`Move shortcut ${index + 1} down`}
                                                                    >
                                                                        <ArrowDown size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div className="form-group">
                                                                <label className="form-label">Action</label>
                                                                <select
                                                                    className="form-input"
                                                                    value={item.actionType}
                                                                    onChange={(event) => handleImportantItemChange(index, 'actionType', event.target.value)}
                                                                >
                                                                    {quickAccessActions.map((action) => (
                                                                        <option key={action.value} value={action.value}>
                                                                            {action.label}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <div className="form-hint">
                                                                    {quickAccessActions.find((action) => action.value === item.actionType)?.description}
                                                                </div>
                                                            </div>

                                                            {item.actionType === 'endpoint' && (
                                                                <div className="form-group">
                                                                    <label className="form-label">Endpoint target</label>
                                                                    <select
                                                                        className="form-input"
                                                                        value={item.target}
                                                                        onChange={(event) => handleImportantItemChange(index, 'target', event.target.value)}
                                                                    >
                                                                        <option value="">Select endpoint</option>
                                                                        {endpoints.map((endpoint) => (
                                                                            <option key={endpoint.id} value={endpoint.id}>
                                                                                {endpoint.name || endpoint.slug}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                    <div className="form-hint">Choose which saved endpoint should open on click.</div>
                                                                </div>
                                                            )}

                                                            {item.actionType === 'url' && (
                                                                <div className="form-group">
                                                                    <label className="form-label">Destination URL</label>
                                                                    <input
                                                                        type="text"
                                                                        className="form-input"
                                                                        placeholder="https://status.example.com/incidents/123"
                                                                        value={item.target}
                                                                        onChange={(event) => handleImportantItemChange(index, 'target', event.target.value)}
                                                                    />
                                                                    <div className="form-hint">Use any external link. Missing `https://` will be added automatically.</div>
                                                                </div>
                                                            )}

                                                            <div className="form-group">
                                                                <label className="form-label">Label</label>
                                                                <input
                                                                    type="text"
                                                                    className="form-input"
                                                                    placeholder={quickAccessMeta.label}
                                                                    value={item.label}
                                                                    onChange={(event) => handleImportantItemChange(index, 'label', event.target.value)}
                                                                />
                                                            </div>

                                                            <div className="form-group">
                                                                <label className="form-label">Supporting text</label>
                                                                <textarea
                                                                    className="form-input"
                                                                    placeholder="Why this shortcut matters, what to check, or a short reminder."
                                                                    value={item.detail}
                                                                    onChange={(event) => handleImportantItemChange(index, 'detail', event.target.value)}
                                                                />
                                                            </div>

                                                            <div className="form-group">
                                                                <label className="form-label">Color tag</label>
                                                                <div className="important-tone-row">
                                                                    {importantItemTones.map((tone) => (
                                                                        <button
                                                                            key={tone.value}
                                                                            type="button"
                                                                            className={`important-tone-chip tone-${tone.value} ${getImportantItemTone(item) === tone.value ? 'active' : ''}`}
                                                                            onClick={() => handleImportantItemChange(index, 'tone', tone.value)}
                                                                        >
                                                                            <span className="important-tone-dot" />
                                                                            {tone.label}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()
                                            ))}
                                        </div>
                                    </div>

                                    <div className="display-settings-section display-settings-surface">
                                        <div className="display-preview-card">
                                            <span>Sidebar preview</span>
                                            <strong>{visibleImportantItems.length > 0 ? 'Quick shortcuts ready' : 'Nothing pinned yet'}</strong>
                                            <p>Shown in the expanded sidebar and available from the collapsed rail through the Quick access button.</p>
                                        </div>

                                        <div className="important-items-preview">
                                            {visibleImportantItems.length > 0 ? (
                                                visibleImportantItems.map((item) => {
                                                    const quickAccessMeta = getQuickAccessMeta(item, endpoints, selectedEndpoint);
                                                    const PreviewIcon = quickAccessMeta.icon;

                                                    return (
                                                        <div key={item.id} className={`sidebar-important-item tone-${getImportantItemTone(item)}`}>
                                                            <div className={`sidebar-important-icon tone-${getImportantItemTone(item)}`}>
                                                                <PreviewIcon size={13} />
                                                            </div>
                                                            <div className="sidebar-important-copy">
                                                                <strong>{cleanImportantValue(item.label) || quickAccessMeta.label}</strong>
                                                                <span>{cleanImportantValue(item.detail) || quickAccessMeta.detail}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="important-items-empty">
                                                    Add shortcuts to errors, endpoints, settings, docs, or any external tool you want one click away.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={handleReset}>
                        <RotateCcw className="icon" />
                        Reset defaults
                    </button>
                    <button className="btn btn-primary" onClick={handleApply}>
                        Apply settings
                    </button>
                </div>
            </div>
        </div>
    );
}
