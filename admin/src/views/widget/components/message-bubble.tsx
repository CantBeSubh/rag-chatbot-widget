import { cn } from "@/lib/utils"

import type { ChatMessage } from "../hooks/useStreamingChat"

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
          message.loading && "italic text-muted-foreground",
        )}
      >
        {message.loading ? "…" : message.content}

        {message.sources.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {message.sources.map((src, i) => (
              <span
                key={i}
                className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
              >
                {src.filename ?? "Source"}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
