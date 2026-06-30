"use client"

import { useState } from "react"

export interface Source {
  filename?: string
  url?: string
}

export interface ChatMessage {
  id: string
  role: "user" | "bot"
  content: string
  sources: Source[]
  loading: boolean
}

function parseSseChunk(
  buffer: string,
  chunk: string,
): { events: Array<{ type: string;[key: string]: unknown }>; remainder: string } {
  const combined = buffer + chunk
  const lines = combined.split("\n")
  const remainder = lines.pop() ?? ""
  const events = lines
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as { type: string;[key: string]: unknown })
  return { events, remainder }
}

export function useStreamingChat(apiKey: string, backendUrl: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)

  async function sendMessage(question: string) {
    const userId = crypto.randomUUID()
    const botId = crypto.randomUUID()

    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: question, sources: [], loading: false },
      { id: botId, role: "bot", content: "", sources: [], loading: true },
    ])
    setIsStreaming(true)

    try {
      const response = await fetch(`${backendUrl}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ question }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`Backend returned ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let fullContent = ""

      setMessages((prev) =>
        prev.map((m) => (m.id === botId ? { ...m, loading: false } : m)),
      )

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const parsed = parseSseChunk(buffer, decoder.decode(value, { stream: true }))
        buffer = parsed.remainder

        for (const event of parsed.events) {
          if (event.type === "token") {
            fullContent += event.content as string
            setMessages((prev) =>
              prev.map((m) => (m.id === botId ? { ...m, content: fullContent } : m)),
            )
          } else if (event.type === "done") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === botId ? { ...m, sources: event.sources as Source[] } : m,
              ),
            )
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botId
            ? { ...m, content: "Something went wrong. Please try again.", loading: false }
            : m,
        ),
      )
    } finally {
      setIsStreaming(false)
    }
  }

  return { messages, isStreaming, sendMessage }
}
