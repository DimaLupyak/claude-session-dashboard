import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'
import type { ModelUsage } from '@/lib/parsers/types'
import { formatTokenCount } from '@/lib/utils/format'

const COLORS = ['#d97757', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#b07cc5']

export function ModelUsageChart({ data }: { data: ModelUsage }) {
  const chartData = Object.entries(data).map(([model, usage]) => ({
    name: model.replace(/^claude-/, '').split('-202')[0],
    fullName: model,
    totalTokens: usage.inputTokens + usage.outputTokens,
    outputTokens: usage.outputTokens,
  }))

  // Sort by total and take top models
  chartData.sort((a, b) => b.totalTokens - a.totalTokens)

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <h3 className="text-sm font-semibold text-gray-300">Model Usage</h3>
      <p className="mt-1 text-xs text-gray-500">Token usage by model</p>

      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              dataKey="totalTokens"
              nameKey="name"
              strokeWidth={0}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.8} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatTokenCount(value as number)}
              contentStyle={{
                backgroundColor: '#1c1c1a',
                border: '1px solid #3d3b36',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
