import { useMemo, useState } from "react"

import { ChatLog } from "@/server/logs"

import { LatencyDataPoint } from "./interface"
import { TimeRange } from "../throughput-chart/interface"

function avg(values: number[]): number | null {
  if (!values.length) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

function bucket1D(logs: ChatLog[]): LatencyDataPoint[] {
  const now = new Date()
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const map = new Map<number, { label: string; values: number[] }>()

  for (let h = 0; h < 24; h++) {
    const d = new Date(now)
    d.setHours(now.getHours() - 23 + h, 0, 0, 0)
    const label = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    map.set(d.getHours(), { label, values: [] })
  }

  for (const log of logs) {
    const t = new Date(log.created_at)
    if (t < cutoff) continue
    map.get(t.getHours())?.values.push(log.latency_ms)
  }

  return Array.from(map.values()).map(({ label, values }) => ({ label, avg_ms: avg(values) }))
}

function bucketByDay(logs: ChatLog[], days: number): LatencyDataPoint[] {
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(now.getDate() - days)
  const map = new Map<string, { label: string; values: number[] }>()

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString([], { month: "short", day: "numeric" })
    map.set(key, { label, values: [] })
  }

  for (const log of logs) {
    const t = new Date(log.created_at)
    if (t < cutoff) continue
    map.get(t.toISOString().slice(0, 10))?.values.push(log.latency_ms)
  }

  return Array.from(map.values()).map(({ label, values }) => ({ label, avg_ms: avg(values) }))
}

function bucketAll(logs: ChatLog[]): LatencyDataPoint[] {
  const map = new Map<string, { label: string; values: number[] }>()
  const sorted = [...logs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  for (const log of sorted) {
    const key = new Date(log.created_at).toISOString().slice(0, 10)
    if (!map.has(key)) {
      const label = new Date(log.created_at).toLocaleDateString([], { month: "short", day: "numeric" })
      map.set(key, { label, values: [] })
    }
    map.get(key)!.values.push(log.latency_ms)
  }

  return Array.from(map.values()).map(({ label, values }) => ({ label, avg_ms: avg(values) }))
}

export function useLatencyChart(logs: ChatLog[]) {
  const [range, setRange] = useState<TimeRange>("7D")

  const data = useMemo<LatencyDataPoint[]>(() => {
    switch (range) {
      case "1D": return bucket1D(logs)
      case "7D": return bucketByDay(logs, 7)
      case "1M": return bucketByDay(logs, 30)
      case "ALL": return bucketAll(logs)
    }
  }, [logs, range])

  return { data, range, setRange }
}
