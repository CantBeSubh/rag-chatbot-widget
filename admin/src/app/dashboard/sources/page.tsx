"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, Upload } from "lucide-react"
import { useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  deleteSource,
  getSources,
  ingestFile,
  ingestUrl,
} from "@/server/sources"

import { getColumns } from "./columns"

const PENDING = ["queued", "crawling", "processing"]

// ── Add URL dialog ────────────────────────────────────────────────────────────

function AddUrlDialog({ onSuccess }: { onSuccess: () => void }) {
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add URL
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add URL</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Input
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground whitespace-nowrap">
              Max pages
            </label>
            <Input
              type="number"
              min={1}
              max={500}
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              className="w-24"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crawl
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Upload file dialog ────────────────────────────────────────────────────────

function UploadFileDialog({ onSuccess }: { onSuccess: () => void }) {
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-2 h-4 w-4" />
          Upload File
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload File</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div
            className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30"
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
            {file ? (
              <p className="text-sm font-medium">{file.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Drop a file here or click to browse
                <br />
                <span className="text-xs">PDF, DOCX, TXT, MD</span>
              </p>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {file && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{file.name}</Badge>
              <button
                className="text-xs text-muted-foreground underline"
                onClick={() => setFile(null)}
              >
                remove
              </button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!file || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SourcesPage() {
  const queryClient = useQueryClient()

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: getSources,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data?.length) return false
      return data.some((s) => PENDING.includes(s.status)) ? 3000 : false
    },
  })

  const deleteMutation = useMutation({
    mutationKey: ["source", "delete"],
    mutationFn: deleteSource,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources"] }),
  })

  function handleDelete(id: string) {
    if (!window.confirm("Delete this source? This cannot be undone.")) return
    deleteMutation.mutate(id)
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["sources"] })
  }

  const columns = getColumns(handleDelete)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sources</h1>
          <p className="text-sm text-muted-foreground">
            Manage ingested content for your knowledge base
          </p>
        </div>
        <div className="flex gap-2">
          <UploadFileDialog onSuccess={invalidate} />
          <AddUrlDialog onSuccess={invalidate} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable columns={columns} data={sources} />
      )}
    </div>
  )
}
