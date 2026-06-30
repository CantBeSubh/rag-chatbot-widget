import { useMemo, useState } from "react"

import { ChatLog } from "@/server/logs"

import { ThroughputDataPoint,TimeRange } from "./interface"

const UNANSWERED_PHRASE = "don't have information"

function isUnanswered(answer: string) {
  return answer.toLowerCase().includes(UNANSWERED_PHRASE)
}

function bucket1D(logs: ChatLog[]): ThroughputDataPoint[] {
  const now = new Date()
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const map = new Map<number, ThroughputDataPoint>()

  for (let h = 0; h < 24; h++) {
    const d = new Date(now)
    d.setHours(now.getHours() - 23 + h, 0, 0, 0)
    const key = d.getHours()
    const label = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    map.set(key, { label, answered: 0, unanswered: 0 })
  }

  for (const log of logs) {
    const t = new Date(log.created_at)
    if (t < cutoff) continue
    const key = t.getHours()
    const point = map.get(key)
    if (!point) continue
    if (isUnanswered(log.answer)) point.unanswered++
    else point.answered++
  }

  return Array.from(map.values())
}

function bucketByDay(logs: ChatLog[], days: number): ThroughputDataPoint[] {
  const now = new Date()
  const map = new Map<string, ThroughputDataPoint>()

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString([], { month: "short", day: "numeric" })
    map.set(key, { label, answered: 0, unanswered: 0 })
  }

  const cutoff = new Date(now)
  cutoff.setDate(now.getDate() - days)

  for (const log of logs) {
    const t = new Date(log.created_at)
    if (t < cutoff) continue
    const key = t.toISOString().slice(0, 10)
    const point = map.get(key)
    if (!point) continue
    if (isUnanswered(log.answer)) point.unanswered++
    else point.answered++
  }

  return Array.from(map.values())
}

function bucketAll(logs: ChatLog[]): ThroughputDataPoint[] {
  const map = new Map<string, ThroughputDataPoint>()

  const sorted = [...logs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  for (const log of sorted) {
    const key = new Date(log.created_at).toISOString().slice(0, 10)
    if (!map.has(key)) {
      const label = new Date(log.created_at).toLocaleDateString([], {
        month: "short",
        day: "numeric",
      })
      map.set(key, { label, answered: 0, unanswered: 0 })
    }
    const point = map.get(key)!
    if (isUnanswered(log.answer)) point.unanswered++
    else point.answered++
  }

  return Array.from(map.values())
}

export function useThroughputChart(logs: ChatLog[]) {
  const [range, setRange] = useState<TimeRange>("7D")

  const data = useMemo<ThroughputDataPoint[]>(() => {
    switch (range) {
      case "1D":
        return bucket1D(logs)
      case "7D":
        return bucketByDay(logs, 7)
      case "1M":
        return bucketByDay(logs, 30)
      case "ALL":
        return bucketAll(logs)
    }
  }, [logs, range])

  return { data, range, setRange }
}
