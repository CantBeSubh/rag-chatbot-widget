import type { WidgetConfig } from './config'

declare const process: { env: { PUBLIC_WIDGET_APP_URL: string } }

const WIDGET_APP_URL = process.env.PUBLIC_WIDGET_APP_URL

export function buildWidget(config: WidgetConfig, apiKey: string): void {
  const host = document.createElement('div')
  host.id = 'rag-widget-host'
  host.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 99999;'
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = `
    * { box-sizing: border-box; }
    #bubble {
      width: 56px; height: 56px; border-radius: 50%;
      background: ${config.color}; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      color: white; font-size: 24px;
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
    iframe.classList.contains('open') ? closeWidget() : openWidget()
  })

  const widgetOrigin = new URL(WIDGET_APP_URL).origin
  window.addEventListener('message', (e: MessageEvent<{ type?: string }>) => {
    if (e.origin !== widgetOrigin) return
    if (e.data?.type === 'close') closeWidget()
  })
}

