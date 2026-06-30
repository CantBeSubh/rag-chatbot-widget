"use client"

import { useRef, useState } from "react"

import { SendHorizonal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface ChatInputProps {
  isStreaming: boolean
  onSend: (question: string) => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({ isStreaming, onSend, disabled, placeholder = "Ask a question…" }: ChatInputProps) {
  const [value, setValue] = useState("")
  const ref = useRef<HTMLTextAreaElement>(null)

  function handleSend() {
    const q = value.trim()
    if (!q || isStreaming) return
    setValue("")
    onSend(q)
    ref.current?.focus()
  }

  return (
    <div className="flex items-end gap-2 border-t px-3 py-3">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSend()
          }
        }}
        placeholder={placeholder}
        className="min-h-[40px] max-h-[120px] resize-none"
        rows={1}
        disabled={isStreaming || disabled}
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={isStreaming || !value.trim() || disabled}
        aria-label="Send"
      >
        <SendHorizonal />
      </Button>
    </div>
  )
}
