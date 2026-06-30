"use client"

import { LucideX } from "lucide-react"

import { widgetPalette } from "@/lib/widget-palette"

import { ChatInput } from "./components/chat-input"
import { MessageList } from "./components/message-list"
import type { ChatMessage } from "./hooks/useStreamingChat"
import { useStreamingChat } from "./hooks/useStreamingChat"

interface WidgetViewProps {
  apiKey: string
  backendUrl: string
  botName: string
  placeholder?: string
  color?: string
  backgroundColor?: string
  isPreview?: boolean
}

const PREVIEW_MESSAGES: ChatMessage[] = [
  {
    id: "preview-bot",
    role: "bot",
    content: "Hi! How can I help you today?",
    sources: [],
    loading: false,
  },
  {
    id: "preview-user",
    role: "user",
    content: "What can you do?",
    sources: [],
    loading: false,
  },
  {
    id: "preview-bot-2",
    role: "bot",
    content: "I can answer questions from your docs, pages, and files — with source citations.",
    sources: [{ filename: "docs/getting-started.md" }, { url: "https://subhranshu.com" }],
    loading: false,
  },
]

export function WidgetView({ apiKey, backendUrl, botName, placeholder, color, backgroundColor, isPreview }: WidgetViewProps) {
  const chat = useStreamingChat(isPreview ? "" : apiKey, isPreview ? "" : backendUrl)
  const messages = isPreview ? PREVIEW_MESSAGES : chat.messages
  const isStreaming = isPreview ? false : chat.isStreaming
  const sendMessage = isPreview ? async () => { } : chat.sendMessage

  function handleClose() {
    window.parent.postMessage({ type: "close" }, "*")
  }

  const colorStyle =
    color || backgroundColor
      ? (widgetPalette(color ?? "#6366f1", backgroundColor) as React.CSSProperties)
      : undefined

  return (
    <div
      className="flex h-screen flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
      style={colorStyle}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">{botName}</span>
        {!isPreview && (
          <button
            onClick={handleClose}
            className="text-lg leading-none text-muted-foreground hover:text-foreground"
            aria-label="Close chat"
          >
            <LucideX />
          </button>
        )}
      </div>

      <MessageList messages={messages} />

      <ChatInput isStreaming={isStreaming} onSend={sendMessage} disabled={isPreview} placeholder={placeholder} />
    </div>
  )
}

