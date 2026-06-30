"use client"

import { CartesianGrid, Line, LineChart, XAxis } from "recharts"

import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { ChatLog } from "@/server/logs"

import { TimeRange } from "./interface"
import { useThroughputChart } from "./logic"

const chartConfig = {
  answered: {
    label: "Answered",
    color: "var(--color-emerald-500)",
  },
  unanswered: {
    label: "Unanswered",
    color: "var(--color-red-500)",
  },
} satisfies ChartConfig

const RANGES: { label: string; value: TimeRange }[] = [
  { label: "1D", value: "1D" },
  { label: "7D", value: "7D" },
  { label: "1M", value: "1M" },
  { label: "All", value: "ALL" },
]

export function ThroughputChart({ logs }: { logs: ChatLog[] }) {
  const { data, range, setRange } = useThroughputChart(logs)

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Answer Throughput</p>
          <p className="text-xs text-muted-foreground">Questions answered vs unanswered over time</p>
        </div>
        <div className="flex rounded-md border overflow-hidden text-xs">
          {RANGES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={`px-3 py-1.5 transition-colors ${range === value
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
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Line dataKey="unanswered" stroke="var(--color-red-500)" strokeWidth={2} dot={false} strokeDasharray="4 4" />
          <Line dataKey="answered" stroke="var(--color-emerald-500)" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartContainer>
    </div>
  )
}
