declare const process: { env: { PUBLIC_BACKEND_URL: string } }

const BACKEND_URL = process.env.PUBLIC_BACKEND_URL

export interface WidgetConfig {
  bot_name: string
  color: string
  background_color: string
  placeholder: string
  allowed_domains: string[]
}

export async function fetchConfig(apiKey: string): Promise<WidgetConfig> {
  const res = await fetch(`${BACKEND_URL}/config`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (res.status === 401) {
    console.error('[RAG Widget] Invalid API key.')
    throw new Error('[RAG Widget] Invalid API key.')
  }
  if (!res.ok) {
    console.error(`[RAG Widget] Failed to load config (HTTP ${res.status}).`)
    throw new Error(`[RAG Widget] Failed to load config (HTTP ${res.status}).`)
  }
  return res.json() as Promise<WidgetConfig>
}

export function isDomainAllowed(allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true
  const hostname = window.location.hostname
  return allowedDomains.some((d) => d === hostname || hostname.endsWith(`.${d}`))
}
