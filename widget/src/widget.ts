import { getApiKey } from './auth'
import { buildWidget } from './ui'
import { fetchConfig, isDomainAllowed } from './config'

declare global {
  interface Window {
    __ragWidget?: { apiKey: string }
  }
}

async function init(): Promise<void> {
  const apiKey = getApiKey()
  const config = await fetchConfig(apiKey)

  if (!isDomainAllowed(config.allowed_domains)) return

  buildWidget(config, apiKey)
  window.__ragWidget = { apiKey }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init())
} else {
  void init()
}
