import type { WidgetConfig } from './config'

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none" width="28" height="28"><path d="M44.05 64.223c.072-7.343-1.79-13.314-4.158-13.337s-4.346 5.91-4.417 13.253c-.072 7.343 1.79 13.315 4.157 13.338 2.369.023 4.346-5.911 4.418-13.254Zm-13.736-1.667c4.031-6.139 5.694-12.168 3.714-13.468s-6.852 2.622-10.882 8.76c-4.03 6.139-5.693 12.168-3.714 13.468 1.98 1.3 6.852-2.622 10.882-8.76Zm-10.668-8.807c6.71-2.985 11.368-7.158 10.406-9.322-.963-2.164-7.182-1.498-13.891 1.486-6.71 2.984-11.369 7.158-10.406 9.322s7.182 1.498 13.89-1.486Zm9.6-15.39c.36-2.34-5.231-5.144-12.489-6.26C9.5 30.98 3.324 31.972 2.964 34.313s5.231 5.143 12.489 6.26c7.257 1.117 13.433.126 13.793-2.215Zm2.606-5.576c1.568-1.774-1.62-7.155-7.123-12.018-5.502-4.862-11.234-7.366-12.802-5.591-1.569 1.774 1.62 7.155 7.123 12.018 5.502 4.862 11.234 7.366 12.802 5.591Zm5.191-3.258c2.279-.645 2.505-6.896.506-13.962-2-7.065-5.468-12.27-7.747-11.626s-2.505 6.896-.505 13.962 5.467 12.27 7.746 11.626Zm14.091-11.407c2.138-7.024 2.035-13.278-.23-13.968s-5.836 4.446-7.975 11.471-2.035 13.279.23 13.969 5.836-4.447 7.975-11.472Zm10.069 9.492c5.596-4.754 8.89-10.071 7.357-11.876s-7.313.587-12.91 5.34c-5.596 4.755-8.89 10.072-7.356 11.877 1.533 1.805 7.313-.586 12.91-5.34Zm3.328 13.433c7.279-.974 12.924-3.666 12.61-6.013s-6.469-3.46-13.747-2.487c-7.278.974-12.924 3.666-12.61 6.013s6.469 3.46 13.747 2.487Zm9.389 14.863c1.005-2.145-3.57-6.41-10.22-9.525-6.649-3.117-12.854-3.904-13.858-1.76s3.57 6.409 10.22 9.525c6.648 3.116 12.853 3.904 13.858 1.76ZM59.933 71.728c2.005-1.26.462-7.322-3.447-13.538s-8.702-10.234-10.707-8.974-.462 7.322 3.447 13.539 8.703 10.234 10.707 8.973Z" stroke="currentColor" stroke-width=".8" stroke-miterlimit="10"/></svg>`

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
