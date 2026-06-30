"use server"

import { apiFetch } from "./base"

export type LLMConfig = {
  system_prompt: string
  temperature: number
  max_tokens: number
}

export type WidgetConfig = {
  bot_name: string
  color: string
  background_color: string
  placeholder: string
  allowed_domains: string[]
  llm_config: LLMConfig
}

const DEFAULT_LLM_CONFIG: LLMConfig = {
  system_prompt:
    "You are a helpful assistant. Answer the user's question using ONLY the context " +
    'provided below. If the answer is not in the context, say "I don\'t have information ' +
    'about that in my knowledge base."\n\nDo not make up information. Always be concise and direct.',
  temperature: 0.1,
  max_tokens: 1024,
}

export async function getConfig(): Promise<WidgetConfig> {
  try {
    const res = await apiFetch("/config")
    if (!res.ok) throw new Error(`getConfig failed: ${res.status}`)
    return res.json()
  } catch (error) {
    console.log(error)
    return {
      bot_name: "Your Bot",
      color: "#6366f1",
      background_color: "#ffffff",
      placeholder: "Ask me anything...",
      allowed_domains: [],
      llm_config: DEFAULT_LLM_CONFIG,
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
