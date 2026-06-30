"use client"

import { ChatInput } from "./components/chat-input"
import { MessageList } from "./components/message-list"
import { useStreamingChat } from "./hooks/useStreamingChat"

interface WidgetViewProps {
  apiKey: string
  backendUrl: string
  botName: string
}

export function WidgetView({ apiKey, backendUrl, botName }: WidgetViewProps) {
  const { messages, isStreaming, sendMessage } = useStreamingChat(apiKey, backendUrl)

  function handleClose() {
    window.parent.postMessage({ type: "close" }, "*")
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">{botName}</span>
        <button
          onClick={handleClose}
          className="text-lg leading-none text-muted-foreground hover:text-foreground"
          aria-label="Close chat"
        >
          ×
        </button>
      </div>

      <MessageList messages={messages} />

      <ChatInput isStreaming={isStreaming} onSend={sendMessage} />
    </div>
  )
}
