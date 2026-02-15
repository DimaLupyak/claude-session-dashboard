import type { StatsCache, SessionDetail } from '@/lib/parsers/types'

function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function toCSVRow(fields: Array<string | number>): string {
  return fields.map((f) => escapeCSVField(String(f))).join(',')
}

export function dailyActivityToCSV(stats: StatsCache): string {
  const header = toCSVRow(['date', 'messageCount', 'sessionCount', 'toolCallCount'])
  const rows = stats.dailyActivity.map((day) =>
    toCSVRow([day.date, day.messageCount, day.sessionCount, day.toolCallCount]),
  )
  return [header, ...rows].join('\n')
}

export function dailyTokensToCSV(stats: StatsCache): string {
  const header = toCSVRow(['date', 'model', 'tokens'])
  const rows: string[] = []
  for (const day of stats.dailyModelTokens) {
    for (const [model, tokens] of Object.entries(day.tokensByModel)) {
      rows.push(toCSVRow([day.date, model, tokens]))
    }
  }
  return [header, ...rows].join('\n')
}

export function modelUsageToCSV(stats: StatsCache): string {
  const header = toCSVRow([
    'model',
    'inputTokens',
    'outputTokens',
    'cacheReadInputTokens',
    'cacheCreationInputTokens',
  ])
  const rows = Object.entries(stats.modelUsage).map(([model, usage]) =>
    toCSVRow([
      model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadInputTokens,
      usage.cacheCreationInputTokens,
    ]),
  )
  return [header, ...rows].join('\n')
}

export function statsToJSON(stats: StatsCache): string {
  return JSON.stringify(stats, null, 2)
}

export function sessionToJSON(detail: SessionDetail): string {
  return JSON.stringify(detail, null, 2)
}

export function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  try {
    document.body.appendChild(a)
    a.click()
  } finally {
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }
}
