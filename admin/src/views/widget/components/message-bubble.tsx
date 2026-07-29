import ReactMarkdown, { type Components } from "react-markdown"

import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

import type { ChatMessage } from "../hooks/useStreamingChat"

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-md bg-black/10 p-2 font-mono text-[0.85em] last:mb-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-current/30 pl-2 opacity-80 last:mb-0">
      {children}
    </blockquote>
  ),
  h1: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
  h2: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
  h3: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] min-w-0 break-words rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
          message.loading && "italic text-muted-foreground",
        )}
      >
        {message.loading ? (
          "…"
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </ReactMarkdown>
        )}

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
