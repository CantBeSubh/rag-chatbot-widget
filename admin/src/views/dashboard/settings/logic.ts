import { useState } from "react"
import toast from "react-hot-toast"
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
    toast.success("Copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteAll()
      user?.reload()
      router.push("/")
      router.refresh()
    } catch {
      toast.error("Failed to delete account data")
      setDeleting(false)
    }
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
