declare const process: { env: { PUBLIC_BACKEND_URL: string } }

const BACKEND_URL = process.env.PUBLIC_BACKEND_URL

export interface WidgetConfig {
  bot_name: string
  color: string
  placeholder: string
  allowed_domains: string[]
}

const DEFAULT_CONFIG: WidgetConfig = {
  bot_name: 'Assistant',
  color: '#6366f1',
  placeholder: 'Ask me anything...',
  allowed_domains: [],
}

export async function fetchConfig(apiKey: string): Promise<WidgetConfig> {
  try {
    const res = await fetch(`${BACKEND_URL}/config`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return DEFAULT_CONFIG
    return { ...DEFAULT_CONFIG, ...(await res.json()) }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function isDomainAllowed(allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true
  const hostname = window.location.hostname
  return allowedDomains.some((d) => d === hostname || hostname.endsWith(`.${d}`))
}
