"use server"

import { apiFetch } from "./base"

export type WidgetConfig = {
  bot_name: string
  color: string
  placeholder: string
  allowed_domains: string[]
}

export async function getConfig(): Promise<WidgetConfig> {
  try {
    const res = await apiFetch("/config")
    if (!res.ok) throw new Error(`getConfig dailed: ${res.status}`)
    return res.json()
  }
  catch (error) {
    console.log(error)
    return {
      bot_name: "Your Bot",
      color: "#6366f1",
      placeholder: "Ask me anything...",
      allowed_domains: [],
    }
  }
}

export async function updateConfig(config: WidgetConfig): Promise<{ saved: boolean }> {
  const result = await apiFetch("/config", {
    method: "PUT",
    body: JSON.stringify(config),
  })
  return result.json()
}
