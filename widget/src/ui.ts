export interface WidgetElements {
  shadow: ShadowRoot
  panel: HTMLElement
}

export function buildWidget(): WidgetElements {
  const host = document.createElement('div')
  host.id = 'rag-widget-host'
  host.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 99999;'
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = `
    * { box-sizing: border-box; font-family: system-ui, sans-serif; }

    #bubble {
      width: 56px; height: 56px; border-radius: 50%;
      background: #6366f1; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      color: white; font-size: 24px;
    }
    #bubble:hover { background: #4f46e5; }

    #chat-panel {
      display: none;
      position: fixed; bottom: 90px; right: 24px;
      width: 360px; height: 520px;
      background: white; border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      flex-direction: column; overflow: hidden;
      border: 1px solid #e5e7eb;
    }
    #chat-panel.open { display: flex; }
  `
  shadow.appendChild(style)

  const bubble = document.createElement('button')
  bubble.id = 'bubble'
  bubble.innerHTML = '💬'
  bubble.setAttribute('aria-label', 'Open chat')
  shadow.appendChild(bubble)

  const panel = document.createElement('div')
  panel.id = 'chat-panel'
  panel.innerHTML = '<p style="padding:16px;color:#6b7280;">Chat coming in M1-D3</p>'
  shadow.appendChild(panel)

  bubble.addEventListener('click', () => {
    panel.classList.toggle('open')
    bubble.innerHTML = panel.classList.contains('open') ? '✕' : '💬'
  })

  return { shadow, panel }
}
