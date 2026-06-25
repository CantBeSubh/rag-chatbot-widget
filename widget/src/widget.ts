import { getApiKey } from './auth'
import { buildWidget, buildPanel } from './ui'
import { wireInput } from './chat'

declare global {
  interface Window {
    __ragWidget?: {
      apiKey: string
      shadow: ShadowRoot
      panel: HTMLElement
    }
  }
}

function init(): void {
  const apiKey = getApiKey()
  const { shadow, panel } = buildWidget()
  buildPanel(panel, shadow)
  wireInput(shadow, apiKey)
  window.__ragWidget = { apiKey, shadow, panel }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
