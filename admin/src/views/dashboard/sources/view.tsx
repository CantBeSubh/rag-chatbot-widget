"use client"

import { Loader2 } from "lucide-react"

import { DataTable } from "@/components/ui/data-table"

import { AddUrlDialog } from "./_components/add-url-dialog/view"
import { getColumns } from "./_components/columns"
import { UploadFileDialog } from "./_components/upload-file-dialog/view"
import { useSourcesPage } from "./logic"

export function SourcesView() {
  const { sources, isLoading, handleDelete, invalidate } = useSourcesPage()
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
