import { useState } from "react"

import { useMutation } from "@tanstack/react-query"

import { ingestUrl } from "@/server/sources"

import type { AddUrlDialogProps } from "./interface"

export function useAddUrlDialog({ onSuccess }: AddUrlDialogProps) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [maxPages, setMaxPages] = useState(50)
  const [error, setError] = useState("")

  const mutation = useMutation({
    mutationKey: ["ingest", "url"],
    mutationFn: () => ingestUrl(url, maxPages),
    onSuccess: () => {
      setOpen(false)
      setUrl("")
      setMaxPages(50)
      onSuccess()
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^https?:\/\/.+/.test(url)) {
      setError("URL must start with http:// or https://")
      return
    }
    setError("")
    mutation.mutate()
  }

  return {
    open,
    setOpen,
    url,
    setUrl,
    maxPages,
    setMaxPages,
    error,
    isPending: mutation.isPending,
    handleSubmit,
  }
}
