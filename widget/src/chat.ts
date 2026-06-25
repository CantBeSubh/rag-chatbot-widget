import { parseSseChunk } from './sse'

// @types/node isn't a dependency here (only DOM types are) — this var is the
// only Node-shaped global this codebase touches, and it's fully replaced with
// a string literal at build time by `bun build --env 'PUBLIC_*'` (see
// widget/package.json), so a minimal local ambient type is enough.
declare const process: { env: { PUBLIC_BACKEND_URL: string } }

const BACKEND_URL = process.env.PUBLIC_BACKEND_URL

interface Source {
  filename?: string
}

export async function sendMessage(
  question: string,
  messagesEl: HTMLElement,
  apiKey: string,
): Promise<void> {
  const userMsg = document.createElement('div')
  userMsg.className = 'msg user'
  userMsg.textContent = question
  messagesEl.appendChild(userMsg)

  const botMsg = document.createElement('div')
  botMsg.className = 'msg bot loading'
  botMsg.textContent = '...'
  messagesEl.appendChild(botMsg)
  messagesEl.scrollTop = messagesEl.scrollHeight

  let fullAnswer = ''

  try {
    const response = await fetch(`${BACKEND_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ question }),
    })

    if (!response.ok || !response.body) {
      throw new Error(`Backend returned ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    botMsg.classList.remove('loading')
    botMsg.textContent = ''

    let sources: Source[] = []
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const parsed = parseSseChunk(buffer, decoder.decode(value, { stream: true }))
      buffer = parsed.remainder

      for (const event of parsed.events) {
        if (event.type === 'token') {
          fullAnswer += event.content as string
          botMsg.textContent = fullAnswer
          messagesEl.scrollTop = messagesEl.scrollHeight
        } else if (event.type === 'done') {
          sources = event.sources as Source[]
        }
      }
    }

    if (sources.length > 0) {
      const citationsEl = document.createElement('div')
      citationsEl.className = 'citations'
      for (const src of sources) {
        const chip = document.createElement('span')
        chip.className = 'citation'
        chip.textContent = src.filename || 'Source'
        citationsEl.appendChild(chip)
      }
      botMsg.appendChild(citationsEl)
    }
  } catch {
    botMsg.classList.remove('loading')
    botMsg.textContent = 'Something went wrong. Please try again.'
    botMsg.style.color = '#dc2626'
  }

  messagesEl.scrollTop = messagesEl.scrollHeight
}

export function wireInput(shadow: ShadowRoot, apiKey: string): void {
  const input = shadow.querySelector('#question-input') as HTMLInputElement
  const sendBtn = shadow.querySelector('#send-btn') as HTMLButtonElement
  const messagesEl = shadow.querySelector('#messages') as HTMLElement

  async function handleSend() {
    const question = input.value.trim()
    if (!question) return
    input.value = ''
    sendBtn.disabled = true
    await sendMessage(question, messagesEl, apiKey)
    sendBtn.disabled = false
    input.focus()
  }

  sendBtn.addEventListener('click', handleSend)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  })
}
