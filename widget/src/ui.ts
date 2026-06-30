import type { WidgetConfig } from './config'

const LOGO_SVG = `<svg width="800px" height="800px" viewBox="0 0 64 64" id="wizard" xmlns="http://www.w3.org/2000/svg"><title>wizard</title><circle cx="33" cy="23" r="23" style="fill:#edebdc"/><line x1="7" y1="17" x2="7" y2="19" style="fill:none;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/><line x1="7" y1="23" x2="7" y2="25" style="fill:none;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/><path d="M21.778,47H47.222A8.778,8.778,0,0,1,56,55.778V61a0,0,0,0,1,0,0H13a0,0,0,0,1,0,0V55.778A8.778,8.778,0,0,1,21.778,47Z" style="fill:#9dc1e4;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/><polygon points="32 61 28 61 34 49 38 49 32 61" style="fill:#ffffff;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/><path d="M59,39H11v4.236A5.763,5.763,0,0,0,16.764,49L34,55l19.236-6A5.763,5.763,0,0,0,59,43.236Z" style="fill:#9dc1e4;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/><line x1="3" y1="21" x2="5" y2="21" style="fill:none;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/><line x1="9" y1="21" x2="11" y2="21" style="fill:none;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/><circle cx="55.5" cy="6.5" r="2.5" style="fill:none;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/><circle cx="13.984" cy="6.603" r="1.069" style="fill:#4c241d"/><ellipse cx="35" cy="39" rx="24" ry="6" style="fill:#6b4f5b;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/><circle cx="5.984" cy="30.603" r="1.069" style="fill:#4c241d"/><path d="M48,13V10.143A6.143,6.143,0,0,0,41.857,4H27.143A6.143,6.143,0,0,0,21,10.143V13" style="fill:#9dc1e4;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/><rect x="20" y="17.81" width="29" height="14.19" style="fill:#ffe8dc;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/><path d="M41.972,13H48a4,4,0,0,1,4,4h0a4,4,0,0,1-4,4H21a4,4,0,0,1-4-4h0a4,4,0,0,1,4-4H37" style="fill:#ffffff;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/><circle cx="39.5" cy="25.5" r="1.136" style="fill:#4c241d"/><circle cx="29.5" cy="25.5" r="1.136" style="fill:#4c241d"/><path d="M43.875,32a6.472,6.472,0,0,0-5.219-2.2A5.2,5.2,0,0,0,35,31.974,5.2,5.2,0,0,0,31.344,29.8,6.472,6.472,0,0,0,26.125,32H20v4.5a14.5,14.5,0,0,0,29,0V32Z" style="fill:#ffffff;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/><line x1="33" y1="36" x2="37" y2="36" style="fill:none;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/><rect x="32" y="10" width="5" height="5" transform="translate(1.266 28.056) rotate(-45)" style="fill:#bd53b5;stroke:#4c241d;stroke-linecap:round;stroke-linejoin:round;stroke-width:2px"/></svg>`

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
  bubble.innerHTML = LOGO_SVG
  bubble.setAttribute('aria-label', 'Open chat')
  shadow.appendChild(bubble)

  function openWidget() {
    iframe.classList.add('open')
    bubble.innerHTML = '✕'
  }

  function closeWidget() {
    iframe.classList.remove('open')
    bubble.innerHTML = LOGO_SVG
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
