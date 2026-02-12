/**
 * Shorten long MCP tool names for display.
 * e.g. "mcp__plugin_playwright_playwright__browser_navigate" → "browser_navigate"
 * e.g. "mcp__plugin_context7_context7__resolve-library-id" → "resolve-library-id"
 */
export function shortenToolName(name: string): string {
  // MCP plugin tools: mcp__plugin_{plugin}_{provider}__{action}
  const mcpMatch = name.match(/^mcp__[^_]+_[^_]+_[^_]+__(.+)$/)
  if (mcpMatch) return mcpMatch[1]
  return name
}

const TOOL_COLORS: Record<string, string> = {
  // File reading
  Read: '#60a5fa', // blue-400
  Grep: '#60a5fa',
  Glob: '#60a5fa',

  // File writing
  Write: '#34d399', // emerald-400
  Edit: '#34d399',
  NotebookEdit: '#34d399',

  // Shell execution
  Bash: '#fbbf24', // amber-400

  // Agent dispatch
  Task: '#818cf8', // indigo-400
  TaskCreate: '#c084fc', // purple-400
  TaskUpdate: '#c084fc',
  TaskList: '#c084fc',
  TaskGet: '#c084fc',

  // Skill invocation
  Skill: '#fcd34d', // amber-300

  // Web access
  WebSearch: '#22d3ee', // cyan-400
  WebFetch: '#22d3ee',

  // Plan mode
  EnterPlanMode: '#f472b6', // pink-400
  ExitPlanMode: '#f472b6',

  // User interaction
  AskUserQuestion: '#a78bfa', // violet-400
}

const DEFAULT_COLOR = '#9ca3af' // gray-400

export function getToolColor(toolName: string): string {
  return TOOL_COLORS[toolName] ?? DEFAULT_COLOR
}

export function getToolColorClass(toolName: string): string {
  const colorMap: Record<string, string> = {
    '#60a5fa': 'text-blue-400',
    '#34d399': 'text-emerald-400',
    '#fbbf24': 'text-amber-400',
    '#818cf8': 'text-indigo-400',
    '#c084fc': 'text-purple-400',
    '#fcd34d': 'text-amber-300',
    '#22d3ee': 'text-cyan-400',
    '#f472b6': 'text-pink-400',
    '#a78bfa': 'text-violet-400',
    '#9ca3af': 'text-gray-400',
  }
  const hex = getToolColor(toolName)
  return colorMap[hex] ?? 'text-gray-400'
}
