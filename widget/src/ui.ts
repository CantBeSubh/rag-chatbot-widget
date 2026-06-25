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
  shadow.appendChild(panel)

  bubble.addEventListener('click', () => {
    panel.classList.toggle('open')
    bubble.innerHTML = panel.classList.contains('open') ? 'x' : '💬'
  })

  return { shadow, panel }
}

export function buildPanel(panel: HTMLElement, shadow: ShadowRoot): void {
  panel.innerHTML = `
    <div id="header">
      <span id="bot-name">Assistant</span>
      <button id="close-btn" aria-label="Close">X</button>
    </div>
    <div id="messages"></div>
    <div id="input-row">
      <input id="question-input" type="text" placeholder="Ask me anything..." />
      <button id="send-btn">Send</button>
    </div>
  `

  const closeBtn = panel.querySelector('#close-btn') as HTMLButtonElement
  const bubble = shadow.querySelector('#bubble') as HTMLButtonElement
  closeBtn.addEventListener('click', () => {
    panel.classList.remove('open')
    bubble.innerHTML = '💬'
  })

  const style = shadow.querySelector('style') as HTMLStyleElement
  style.textContent += `
    #header {
      padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
      display: flex; justify-content: space-between; align-items: center;
      font-weight: 600; font-size: 14px; color: #111827;
    }
    #close-btn { background: none; border: none; cursor: pointer; color: #6b7280; font-size: 16px; }

    #messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
    }

    .msg { max-width: 85%; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.5; }
    .msg.user { align-self: flex-end; background: #6366f1; color: white; border-bottom-right-radius: 4px; }
    .msg.bot  { align-self: flex-start; background: #f3f4f6; color: #111827; border-bottom-left-radius: 4px; }
    .msg.bot.loading { color: #9ca3af; font-style: italic; }

    .citations { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
    .citation {
      font-size: 11px; padding: 2px 8px; border-radius: 4px;
      background: #ede9fe; color: #5b21b6; text-decoration: none;
      border: 1px solid #c4b5fd; cursor: pointer;
    }
    .citation:hover { background: #ddd6fe; }

    #input-row {
      padding: 12px 16px; border-top: 1px solid #e5e7eb;
      display: flex; gap: 8px;
    }
    #question-input {
      flex: 1; padding: 8px 12px; border: 1px solid #d1d5db;
      border-radius: 8px; font-size: 14px; outline: none;
    }
    #question-input:focus { border-color: #6366f1; }
    #send-btn {
      padding: 8px 14px; background: #6366f1; color: white;
      border: none; border-radius: 8px; cursor: pointer; font-size: 16px;
    }
    #send-btn:disabled { background: #c7d2fe; cursor: not-allowed; }
  `
}
