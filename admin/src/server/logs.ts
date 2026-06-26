"use server"

import { apiFetch } from "./base"

export type ChatLog = {
  id: string
  tenant_id: string
  question: string
  answer: string
  sources_cited: { url?: string; filename?: string }[]
  latency_ms: number
  created_at: string
}

export type LogsResponse = {
  logs: ChatLog[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export type LogsParams = {
  page?: number
  per_page?: number
  unanswered_only?: boolean
  date_from?: string
  date_to?: string
}

export async function getLogs(params: LogsParams = {}): Promise<LogsResponse> {
  const { page = 1, per_page = 25, unanswered_only = false, date_from, date_to } = params

  const qs = new URLSearchParams({
    page: String(page),
    per_page: String(per_page),
    unanswered_only: String(unanswered_only),
  })
  if (date_from) qs.set("date_from", date_from)
  if (date_to) qs.set("date_to", date_to)

  const res = await apiFetch(`/logs?${qs}`)
  if (!res.ok) throw new Error(`getLogs failed: ${res.status}`)
  return res.json()
}
