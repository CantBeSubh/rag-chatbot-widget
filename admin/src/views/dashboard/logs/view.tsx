"use client"

import { Loader2 } from "lucide-react"

import { DataTable } from "@/components/ui/data-table"

import { columns } from "./_components/columns"
import { useLogsPage } from "./logic"

export function LogsView() {
  const { logs, isLoading, unansweredOnly, handleToggleUnanswered } = useLogsPage()

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Chat Logs</h1>
          <p className="text-sm text-muted-foreground">
            Every question users have asked the chatbot
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
          <input
            type="checkbox"
            checked={unansweredOnly}
            onChange={(e) => handleToggleUnanswered(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 accent-primary"
          />
          Unanswered only
        </label>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable columns={columns} data={logs} />
      )}
    </div>
  )
}
