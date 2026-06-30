"use client"

import { ColumnDef } from "@tanstack/react-table"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"

import { Badge } from "@/components/ui/badge"
import { ChatLog } from "@/server/logs"
dayjs.extend(relativeTime)

const UNANSWERED_PHRASE = "don't have information"

function isUnanswered(answer: string) {
  return answer.toLowerCase().includes(UNANSWERED_PHRASE)
}

export const columns: ColumnDef<ChatLog>[] = [
  {
    accessorKey: "created_at",
    header: "Time",
    cell: ({ getValue }) => dayjs(getValue() as string).fromNow()
  },
  {
    accessorKey: "question",
    header: "Question",
    cell: ({ getValue }) => {
      const q = getValue<string>()
      return (
        <span className="text-sm truncate max-w-[200px] block" title={q}>
          {q}
        </span>
      )
    },
  },
  {
    accessorKey: "answer",
    header: "Answer",
    cell: ({ getValue }) => {
      const a = getValue<string>()
      return (
        <span className="text-sm text-muted-foreground truncate max-w-[320px] block" title={a}>
          {a}
        </span>
      )
    },
  },
  {
    accessorKey: "sources_cited",
    header: "Sources",
    cell: ({ getValue }) => {
      const sources = getValue<ChatLog["sources_cited"]>()
      if (!sources?.length) return <span className="text-muted-foreground">—</span>
      const labels = sources.map((s) => s.filename ?? s.url).join(", ")
      return (
        <span className="text-sm truncate max-w-[160px] block" title={labels}>
          {labels}
        </span>
      )
    },
  },
  {
    accessorKey: "latency_ms",
    header: "Latency",
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{getValue<number>()}ms</span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) =>
      isUnanswered(row.original.answer) ? (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
          Unanswered
        </Badge>
      ) : (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
          Answered
        </Badge>
      ),
  },
]
