import { useState } from "react"
import { useRouter } from "next/navigation"

import { useUser } from "@clerk/nextjs"

import { deleteAll } from "@/server/tenant"

export function useSettingsPage() {
  const { user } = useUser()
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const apiKey = (user?.publicMetadata?.apikey as string) ?? "error-no-key"
  const scriptTag = `<script src="${process.env.NEXT_PUBLIC_WIDGET_URL}/widget.js?key=${apiKey}"></script>`

  const copy = async () => {
    await navigator.clipboard.writeText(scriptTag)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async () => {
    setDeleting(true)
    await deleteAll()
    user?.reload()
    router.push("/")
    router.refresh()
  }

  return {
    scriptTag,
    copied,
    copy,
    deleteOpen,
    setDeleteOpen,
    deleting,
    handleDelete,
  }
}
