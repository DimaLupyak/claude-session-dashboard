export const selectors = {
  sidebar: {
    root: 'aside',
    sessionsLink: 'a[href="/sessions"]',
    statsLink: 'a[href="/stats"]',
    settingsLink: 'a[href="/settings"]',
  },
  sessions: {
    searchInput: 'input[placeholder*="Search"]',
    projectFilter: 'select',
    sessionCard: 'a[href*="/sessions/"]',
  },
  sessionDetail: {
    backLink: 'a[href="/sessions"]',
    contextPanel: 'text=Context Window',
    toolUsagePanel: 'text=Tool Usage',
    costPanel: 'text=Cost',
    errorPanel: 'text=Errors',
  },
  stats: {
    overviewTab: 'button:has-text("Overview")',
    projectsTab: 'button:has-text("Projects")',
  },
  settings: {
    saveButton: 'button:has-text("Save")',
    resetButton: 'button:has-text("Reset")',
  },
}
