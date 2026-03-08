import { Eye, EyeOff, Maximize2, Minimize2 } from 'lucide-react';

export function SectionVisibilityButtons({ mode = 'expanded', onChangeMode, className = '' }) {
    const isCollapsed = mode === 'collapsed';

    return (
        <div className={['section-visibility-controls', className].filter(Boolean).join(' ')}>
            <button
                type="button"
                className={`section-visibility-button ${isCollapsed ? 'active' : ''}`}
                onClick={() => onChangeMode(isCollapsed ? 'expanded' : 'collapsed')}
                title={isCollapsed ? 'Expand section' : 'Collapse section'}
            >
                {isCollapsed ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                <span>{isCollapsed ? 'Expand' : 'Collapse'}</span>
            </button>

            <button
                type="button"
                className="section-visibility-button"
                onClick={() => onChangeMode('hidden')}
                title="Hide section"
            >
                <EyeOff size={14} />
                <span>Hide</span>
            </button>
        </div>
    );
}

export function HiddenSectionsTray({ sections, onRestore, className = '' }) {
    if (!sections.length) {
        return null;
    }

    return (
        <div className={['hidden-sections-tray', className].filter(Boolean).join(' ')}>
            <span className="hidden-sections-label">Hidden panels</span>

            <div className="hidden-sections-list">
                {sections.map((section) => (
                    <button
                        key={section.id}
                        type="button"
                        className="hidden-section-chip"
                        onClick={() => onRestore(section.id)}
                    >
                        <Eye size={13} />
                        <span>{section.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

export function CollapsedPanel({
    kicker,
    title,
    summary,
    mode = 'collapsed',
    onChangeMode,
    className = '',
    children,
}) {
    return (
        <div className={['section-collapsed-card', className].filter(Boolean).join(' ')}>
            <div className="section-collapsed-header">
                <div className="section-collapsed-copy">
                    {kicker && <span className="section-collapsed-kicker">{kicker}</span>}
                    <h3>{title}</h3>
                    {summary && <p className="section-collapsed-summary">{summary}</p>}
                </div>

                <SectionVisibilityButtons mode={mode} onChangeMode={onChangeMode} className="section-visibility-controls-compact" />
            </div>

            {children ? <div className="section-collapsed-preview">{children}</div> : null}
        </div>
    );
}
