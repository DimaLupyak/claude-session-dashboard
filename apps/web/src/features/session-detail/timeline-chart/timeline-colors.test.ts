import { describe, expect, it } from 'vitest'
import {
  getToolColor,
  getToolColorClass,
  shortenToolName,
} from './timeline-colors'

describe('shortenToolName', () => {
  it('shortens MCP plugin tool names to the action part', () => {
    expect(
      shortenToolName('mcp__plugin_playwright_playwright__browser_navigate'),
    ).toBe('browser_navigate')
  })

  it('shortens MCP tools with hyphenated action names', () => {
    expect(
      shortenToolName('mcp__plugin_context7_context7__resolve-library-id'),
    ).toBe('resolve-library-id')
  })

  it('returns the name unchanged for non-MCP tool names', () => {
    expect(shortenToolName('Read')).toBe('Read')
    expect(shortenToolName('Bash')).toBe('Bash')
    expect(shortenToolName('Write')).toBe('Write')
  })

  it('returns an empty string unchanged', () => {
    expect(shortenToolName('')).toBe('')
  })

  it('returns names that start with mcp__ but do not match the full pattern unchanged', () => {
    // Missing double-underscore action separator — does not match the regex
    expect(shortenToolName('mcp__plugin_foo_bar')).toBe('mcp__plugin_foo_bar')
  })
})

describe('getToolColor', () => {
  it('returns the correct hex color for file-reading tools', () => {
    expect(getToolColor('Read')).toBe('#e09070')
    expect(getToolColor('Grep')).toBe('#e09070')
    expect(getToolColor('Glob')).toBe('#e09070')
  })

  it('returns the correct hex color for file-writing tools', () => {
    expect(getToolColor('Write')).toBe('#34d399')
    expect(getToolColor('Edit')).toBe('#34d399')
    expect(getToolColor('NotebookEdit')).toBe('#34d399')
  })

  it('returns the correct hex color for shell execution', () => {
    expect(getToolColor('Bash')).toBe('#fbbf24')
  })

  it('returns the correct hex color for agent dispatch tools', () => {
    expect(getToolColor('Task')).toBe('#818cf8')
    expect(getToolColor('TaskCreate')).toBe('#c084fc')
    expect(getToolColor('TaskUpdate')).toBe('#c084fc')
    expect(getToolColor('TaskList')).toBe('#c084fc')
    expect(getToolColor('TaskGet')).toBe('#c084fc')
  })

  it('returns the correct hex color for skill invocation', () => {
    expect(getToolColor('Skill')).toBe('#fcd34d')
  })

  it('returns the correct hex color for web access tools', () => {
    expect(getToolColor('WebSearch')).toBe('#22d3ee')
    expect(getToolColor('WebFetch')).toBe('#22d3ee')
  })

  it('returns the correct hex color for plan mode tools', () => {
    expect(getToolColor('EnterPlanMode')).toBe('#f472b6')
    expect(getToolColor('ExitPlanMode')).toBe('#f472b6')
  })

  it('returns the correct hex color for user interaction tools', () => {
    expect(getToolColor('AskUserQuestion')).toBe('#a78bfa')
  })

  it('returns the default gray color for unknown tools', () => {
    expect(getToolColor('UnknownTool')).toBe('#9ca3af')
    expect(getToolColor('')).toBe('#9ca3af')
  })
})

describe('getToolColorClass', () => {
  it('returns the correct Tailwind class for file-reading tools', () => {
    expect(getToolColorClass('Read')).toBe('text-brand-400')
    expect(getToolColorClass('Grep')).toBe('text-brand-400')
    expect(getToolColorClass('Glob')).toBe('text-brand-400')
  })

  it('returns the correct Tailwind class for file-writing tools', () => {
    expect(getToolColorClass('Write')).toBe('text-emerald-400')
    expect(getToolColorClass('Edit')).toBe('text-emerald-400')
    expect(getToolColorClass('NotebookEdit')).toBe('text-emerald-400')
  })

  it('returns the correct Tailwind class for shell execution', () => {
    expect(getToolColorClass('Bash')).toBe('text-amber-400')
  })

  it('returns the correct Tailwind class for the Task tool', () => {
    expect(getToolColorClass('Task')).toBe('text-indigo-400')
  })

  it('returns the correct Tailwind class for Task sub-tools', () => {
    expect(getToolColorClass('TaskCreate')).toBe('text-purple-400')
    expect(getToolColorClass('TaskUpdate')).toBe('text-purple-400')
    expect(getToolColorClass('TaskList')).toBe('text-purple-400')
    expect(getToolColorClass('TaskGet')).toBe('text-purple-400')
  })

  it('returns the correct Tailwind class for skill invocation', () => {
    expect(getToolColorClass('Skill')).toBe('text-amber-300')
  })

  it('returns the correct Tailwind class for web access tools', () => {
    expect(getToolColorClass('WebSearch')).toBe('text-cyan-400')
    expect(getToolColorClass('WebFetch')).toBe('text-cyan-400')
  })

  it('returns the correct Tailwind class for plan mode tools', () => {
    expect(getToolColorClass('EnterPlanMode')).toBe('text-pink-400')
    expect(getToolColorClass('ExitPlanMode')).toBe('text-pink-400')
  })

  it('returns the correct Tailwind class for user interaction tools', () => {
    expect(getToolColorClass('AskUserQuestion')).toBe('text-violet-400')
  })

  it('returns text-gray-400 for unknown tools', () => {
    expect(getToolColorClass('UnknownTool')).toBe('text-gray-400')
    expect(getToolColorClass('')).toBe('text-gray-400')
  })
})
