import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"

import type { ChatMessage } from "../hooks/useStreamingChat"
import { MessageBubble } from "./message-bubble"

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <MessageScrollerProvider>
      <MessageScroller className="flex-1">
        <MessageScrollerViewport className="px-4 py-3">
          <MessageScrollerContent>
            {messages.length === 0 && (
              <p className="pt-8 text-center text-sm text-muted-foreground">
                Ask me anything!
              </p>
            )}
            {messages.map((msg) => (
              <MessageScrollerItem key={msg.id}>
                <MessageBubble message={msg} />
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
