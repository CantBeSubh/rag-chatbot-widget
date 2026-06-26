"use client"

import { Loader2, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

import type { AddUrlDialogProps } from "./interface"
import { useAddUrlDialog } from "./logic"

export function AddUrlDialog(props: AddUrlDialogProps) {
  const {
    open, setOpen,
    url, setUrl,
    maxPages, setMaxPages,
    error, isPending, handleSubmit,
  } = useAddUrlDialog(props)

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
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crawl
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
