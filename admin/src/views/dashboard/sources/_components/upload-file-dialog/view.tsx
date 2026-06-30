"use client"

import { Loader2, Upload } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

import type { UploadFileDialogProps } from "./interface"
import { useUploadFileDialog } from "./logic"

export function UploadFileDialog(props: UploadFileDialogProps) {
  const {
    open, setOpen,
    file, setFile,
    dragging, setDragging,
    inputRef, isPending, mutate, handleDrop,
  } = useUploadFileDialog(props)

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
            className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30"
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
                <span className="text-xs">PDF, TXT, MD</span>
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
          <Button onClick={mutate} disabled={!file || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
