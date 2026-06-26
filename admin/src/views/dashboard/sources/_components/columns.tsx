"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Source, SourceStatus } from "@/server/sources"

const STATUS_CLASS: Record<SourceStatus, string> = {
  queued:     "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  crawling:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  processing: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  done:       "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  error:      "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
}

export function getColumns(
  onDelete: (id: string) => void,
): ColumnDef<Source>[] {
  return [
    {
      id: "name",
      header: "Name / URL",
      cell: ({ row }) => {
        const { url, filename } = row.original
        const label = url ?? filename ?? "—"
        return (
          <span className="max-w-xs truncate block text-sm" title={label}>
            {label}
          </span>
        )
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ getValue }) => (
        <Badge variant="outline" className="capitalize">
          {getValue<string>()}
        </Badge>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => {
        const status = getValue<SourceStatus>()
        return (
          <Badge className={STATUS_CLASS[status]}>
            {status}
          </Badge>
        )
      },
    },
    {
      accessorKey: "chunk_count",
      header: "Chunks",
      cell: ({ getValue }) => getValue<number | null>() ?? "—",
    },
    {
      accessorKey: "ingested_at",
      header: "Ingested",
      cell: ({ getValue }) =>
        new Date(getValue<string>()).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(row.original.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ]
}
