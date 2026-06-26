import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { deleteSource, getSources } from "@/server/sources"

import { PENDING } from "./constants"

export function useSourcesPage() {
  const queryClient = useQueryClient()

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: getSources,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data?.length) return false
      return data.some((s) => (PENDING as readonly string[]).includes(s.status)) ? 3000 : false
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

  return { sources, isLoading, handleDelete, invalidate }
}
