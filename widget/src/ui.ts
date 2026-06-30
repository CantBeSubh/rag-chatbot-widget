import type { WidgetConfig } from './config'

declare const process: { env: { PUBLIC_WIDGET_APP_URL: string } }

const WIDGET_APP_URL = process.env.PUBLIC_WIDGET_APP_URL

function primaryForeground(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return '#ffffff'
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lum = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  return lum > 0.179 ? '#0a0a0a' : '#ffffff'
}

export function buildWidget(config: WidgetConfig, apiKey: string): void {
  const host = document.createElement('div')
  host.id = 'rag-widget-host'
  host.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 99999;'
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'closed' })

  const bubbleFg = primaryForeground(config.color)

  const style = document.createElement('style')
  style.textContent = `
    * { box-sizing: border-box; }
    #bubble {
      width: 56px; height: 56px; border-radius: 50%;
      background: ${config.color}; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      color: ${bubbleFg}; font-size: 24px;
    }
    #bubble:hover { filter: brightness(0.9); }
    #chat-frame {
      display: none;
      position: fixed; bottom: 90px; right: 24px;
      width: 360px; height: 520px;
      border: none; background: transparent;
    }
    #chat-frame.open { display: block; }
  `
  shadow.appendChild(style)

  const iframeUrl = new URL(`${WIDGET_APP_URL}/widget`)
  iframeUrl.searchParams.set('apiKey', apiKey)
  iframeUrl.searchParams.set('botName', config.bot_name)
  iframeUrl.searchParams.set('placeholder', config.placeholder)
  iframeUrl.searchParams.set('color', config.color)
  iframeUrl.searchParams.set('backgroundColor', config.background_color)

  const iframe = document.createElement('iframe')
  iframe.id = 'chat-frame'
  iframe.src = iframeUrl.toString()
  iframe.setAttribute('allowtransparency', 'true')
  iframe.setAttribute('title', config.bot_name)
  shadow.appendChild(iframe)

  const bubble = document.createElement('button')
  bubble.id = 'bubble'
  bubble.innerHTML = '💬'
  bubble.setAttribute('aria-label', 'Open chat')
  shadow.appendChild(bubble)

  function openWidget() {
    iframe.classList.add('open')
    bubble.innerHTML = '✕'
  }

  function closeWidget() {
    iframe.classList.remove('open')
    bubble.innerHTML = '💬'
  }

  bubble.addEventListener('click', () => {
    if (iframe.classList.contains('open')) {
      closeWidget()
    } else {
      openWidget()
    }
  })

  const widgetOrigin = new URL(WIDGET_APP_URL).origin
  window.addEventListener('message', (e: MessageEvent<{ type?: string }>) => {
    if (e.origin !== widgetOrigin) return
    if (e.data?.type === 'close') closeWidget()
  })
}
