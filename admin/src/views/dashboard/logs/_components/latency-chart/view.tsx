"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { ChatLog } from "@/server/logs"

import { TimeRange } from "../throughput-chart/interface"
import { useLatencyChart } from "./logic"

const chartConfig = {
  avg_ms: {
    label: "Avg latency",
    color: "var(--color-blue-500)",
  },
} satisfies ChartConfig

const RANGES: { label: string; value: TimeRange }[] = [
  { label: "1D", value: "1D" },
  { label: "7D", value: "7D" },
  { label: "1M", value: "1M" },
  { label: "All", value: "ALL" },
]

export function LatencyChart({ logs }: { logs: ChatLog[] }) {
  const { data, range, setRange } = useLatencyChart(logs)

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Response Latency</p>
          <p className="text-xs text-muted-foreground">Average response time per period (ms)</p>
        </div>
        <div className="flex rounded-md border overflow-hidden text-xs">
          {RANGES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={`px-3 py-1.5 transition-colors ${
                range === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ChartContainer config={chartConfig} className="h-[200px] w-full">
        <LineChart data={data}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            interval="equidistantPreserveStart"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${v}ms`}
            width={50}
          />
          <ChartTooltip
            content={<ChartTooltipContent formatter={(v) => [`${v}ms`, "Avg latency"]} />}
          />
          <Line
            dataKey="avg_ms"
            stroke="var(--color-blue-500)"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ChartContainer>
    </div>
  )
}
