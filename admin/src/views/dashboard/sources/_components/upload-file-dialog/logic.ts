import { useRef, useState } from "react"

import { useMutation } from "@tanstack/react-query"

import { ingestFile } from "@/server/sources"

import type { UploadFileDialogProps } from "./interface"

export function useUploadFileDialog({ onSuccess }: UploadFileDialogProps) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationKey: ["ingest", "file"],
    mutationFn: () => {
      const form = new FormData()
      form.append("file", file!)
      return ingestFile(form)
    },
    onSuccess: () => {
      setOpen(false)
      setFile(null)
      onSuccess()
    },
  })

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  return {
    open,
    setOpen,
    file,
    setFile,
    dragging,
    setDragging,
    inputRef,
    isPending: mutation.isPending,
    mutate: () => mutation.mutate(),
    handleDrop,
  }
}
