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
            {message.sources.map((src, i) =>
              src.url ? (
                <a
                  key={i}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/20 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 12 12"
                    className="size-2.5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 2H2.5A.5.5 0 0 0 2 2.5v7a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V7" />
                    <path d="M7.5 2H10v2.5M10 2 5.5 6.5" />
                  </svg>
                  {src.filename ?? new URL(src.url).hostname}
                </a>
              ) : (
                <span
                  key={i}
                  className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
                >
                  {src.filename ?? "Source"}
                </span>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}
