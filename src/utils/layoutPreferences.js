export const layoutSectionOptions = [
    {
        value: 'expanded',
        label: 'Expanded',
        description: 'Show the full section content.',
    },
    {
        value: 'collapsed',
        label: 'Collapsed',
        description: 'Keep only a compact summary visible.',
    },
    {
        value: 'hidden',
        label: 'Hidden',
        description: 'Remove it from the page until you restore it.',
    },
];

export const dashboardLayoutSections = [
    {
        id: 'dashboard.hero',
        label: 'Hero overview',
        description: 'Main intro, featured route, and quick primary actions.',
    },
    {
        id: 'dashboard.stats',
        label: 'Stats grid',
        description: 'The four high-level metric cards below the hero.',
    },
    {
        id: 'dashboard.inventory',
        label: 'Endpoint inventory',
        description: 'The main endpoint list with open and delete actions.',
    },
    {
        id: 'dashboard.traffic',
        label: 'Top webhook lanes',
        description: 'Traffic comparison rows for your busiest routes.',
    },
    {
        id: 'dashboard.actions',
        label: 'Fast tracks',
        description: 'Shortcut cards for create, inspect, and response tuning.',
    },
    {
        id: 'dashboard.insights',
        label: 'Operating notes',
        description: 'Secondary insight cards shown in the right column.',
    },
    {
        id: 'dashboard.workflow',
        label: 'Recommended setup',
        description: 'The workflow checklist panel in the right column.',
    },
];

export const endpointLayoutSections = [
    {
        id: 'endpoint.overview',
        label: 'Endpoint overview',
        description: 'Name, description, URLs, quick test, and endpoint metadata.',
    },
    {
        id: 'endpoint.metrics',
        label: 'Metrics and tools',
        description: 'Summary cards and endpoint action buttons on the right.',
    },
    {
        id: 'endpoint.requestList',
        label: 'Incoming events',
        description: 'The request list, filters, and live stream panel.',
    },
    {
        id: 'endpoint.requestDetail',
        label: 'Request detail',
        description: 'The payload inspector, AI analysis, and replay area.',
    },
];

export const responseLayoutSections = [
    {
        id: 'response.presets',
        label: 'Quick presets',
        description: 'Preset response buttons near the top of Response Studio.',
    },
    {
        id: 'response.forwarding',
        label: 'Auto-forwarding',
        description: 'Forwarding URL controls and status.',
    },
    {
        id: 'response.integrations',
        label: 'Integrations',
        description: 'Google Sheets, alerts, CRM, storage, and workflow blocks.',
    },
    {
        id: 'response.schedules',
        label: 'Schedules',
        description: 'Synthetic webhook runs and schedule controls.',
    },
    {
        id: 'response.profile',
        label: 'Response profile',
        description: 'Status, headers, body, delay, and active toggle.',
    },
    {
        id: 'response.preview',
        label: 'Preview cards',
        description: 'Current response metrics and the body snapshot sidebar.',
    },
    {
        id: 'response.recommendations',
        label: 'Recommended use',
        description: 'The use-case checklist in the sidebar.',
    },
];

export const layoutSectionGroups = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        description: 'Workspace overview panels',
        sections: dashboardLayoutSections,
    },
    {
        id: 'endpoint',
        label: 'Endpoint workspace',
        description: 'Capture screen panels',
        sections: endpointLayoutSections,
    },
    {
        id: 'response',
        label: 'Response Studio',
        description: 'Response and automation panels',
        sections: responseLayoutSections,
    },
];

export const layoutSectionLabelMap = layoutSectionGroups.reduce((accumulator, group) => {
    group.sections.forEach((section) => {
        accumulator[section.id] = section;
    });

    return accumulator;
}, {});

export const defaultSectionPreferences = Object.fromEntries(
    Object.keys(layoutSectionLabelMap).map((sectionId) => [sectionId, 'expanded']),
);

export function normalizeSectionMode(value) {
    return layoutSectionOptions.some((option) => option.value === value) ? value : 'expanded';
}

export function normalizeSectionPreferences(value = {}) {
    return Object.keys(defaultSectionPreferences).reduce((accumulator, sectionId) => {
        accumulator[sectionId] = normalizeSectionMode(value[sectionId]);
        return accumulator;
    }, {});
}
