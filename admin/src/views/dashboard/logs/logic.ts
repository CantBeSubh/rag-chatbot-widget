import { useState } from "react"

import { useQuery } from "@tanstack/react-query"

import { getLogs } from "@/server/logs"

export function useLogsPage() {
  const [unansweredOnly, setUnansweredOnly] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["logs", { unansweredOnly }],
    queryFn: () => getLogs({ unanswered_only: unansweredOnly }),
  })

  function handleToggleUnanswered(checked: boolean) {
    setUnansweredOnly(checked)
  }

  return {
    logs: data?.logs ?? [],
    isLoading,
    unansweredOnly,
    handleToggleUnanswered,
  }
}
