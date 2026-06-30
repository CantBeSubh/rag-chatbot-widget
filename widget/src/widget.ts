import { getApiKey } from './auth'
import { buildWidget, buildPanel } from './ui'
import { wireInput } from './chat'
import { fetchConfig, isDomainAllowed } from './config'

declare global {
  interface Window {
    __ragWidget?: {
      apiKey: string
      shadow: ShadowRoot
      panel: HTMLElement
    }
  }
}

async function init(): Promise<void> {
  const apiKey = getApiKey()
  const config = await fetchConfig(apiKey)

  if (!isDomainAllowed(config.allowed_domains)) return

  const { shadow, panel } = buildWidget(config)
  buildPanel(panel, shadow, config)
  wireInput(shadow, apiKey)
  window.__ragWidget = { apiKey, shadow, panel }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init())
} else {
  void init()
}
