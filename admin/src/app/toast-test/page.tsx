"use client"

import { useState } from "react"
import toast from "react-hot-toast"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default function ToastTestPage() {
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const showDefault = () => toast("This is a default toast")

  const showSuccess = () => toast.success("Changes saved successfully")

  const showError = () => toast.error("Something went wrong")

  const showLoading = () => {
    const id = toast.loading("Processing your request…")
    setLoadingId(id as string)
  }

  const dismissLoading = () => {
    if (loadingId) {
      toast.dismiss(loadingId)
      setLoadingId(null)
    }
  }

  const showPromise = () =>
    toast.promise(sleep(2000), {
      loading: "Saving…",
      success: "Saved successfully!",
      error: "Failed to save",
    })

  const showPromiseReject = () =>
    toast.promise(
      sleep(1500).then(() => {
        throw new Error("Network error")
      }),
      {
        loading: "Uploading file…",
        success: "File uploaded!",
        error: "Upload failed",
      },
    )

  const showCustomIcon = () =>
    toast("Deployment complete", {
      icon: "🚀",
    })

  const showMultiline = () =>
    toast.success("Your report has been generated and is ready to download from the exports section.", {
      duration: 5000,
    })

  const showCustomDuration = () =>
    toast("This toast stays for 8 seconds", {
      duration: 8000,
    })

  const showPersistent = () =>
    toast("Click × to dismiss me", {
      duration: Infinity,
    })

  const showCustomJsx = () =>
    toast.custom((t) => (
      <div
        className={`flex items-center gap-3 rounded-lg border bg-popover px-4 py-3 shadow-lg transition-all ${t.visible ? "opacity-100" : "opacity-0"
          }`}
      >
        <span className="text-xl">🎉</span>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-popover-foreground">Welcome back!</span>
          <span className="text-xs text-muted-foreground">Your workspace is ready</span>
        </div>
        <button
          onClick={() => toast.dismiss(t.id)}
          className="ml-4 text-xs text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
    ))

  const showDismissAll = () => toast.dismiss()

  const groups = [
    {
      label: "Basic",
      items: [
        { label: "Default", onClick: showDefault, variant: "outline" as const },
        { label: "Success", onClick: showSuccess, variant: "default" as const },
        { label: "Error", onClick: showError, variant: "destructive" as const },
      ],
    },
    {
      label: "Loading",
      items: [
        { label: "Show Loading", onClick: showLoading, variant: "outline" as const },
        { label: "Dismiss Loading", onClick: dismissLoading, variant: "outline" as const },
      ],
    },
    {
      label: "Promise",
      items: [
        { label: "Promise (resolves)", onClick: showPromise, variant: "outline" as const },
        { label: "Promise (rejects)", onClick: showPromiseReject, variant: "outline" as const },
      ],
    },
    {
      label: "Custom",
      items: [
        { label: "Custom Icon 🚀", onClick: showCustomIcon, variant: "outline" as const },
        { label: "Custom JSX", onClick: showCustomJsx, variant: "outline" as const },
      ],
    },
    {
      label: "Duration",
      items: [
        { label: "Multiline (5s)", onClick: showMultiline, variant: "outline" as const },
        { label: "Long (8s)", onClick: showCustomDuration, variant: "outline" as const },
        { label: "Persistent (∞)", onClick: showPersistent, variant: "outline" as const },
      ],
    },
    {
      label: "Control",
      items: [{ label: "Dismiss All", onClick: showDismissAll, variant: "secondary" as const }],
    },
  ]

  return (
    <div className="min-h-screen p-10">
      <ThemeToggle />
      <h1 className="mb-1 text-2xl font-semibold">Toast Test</h1>
      <p className="mb-10 text-sm text-muted-foreground">All react-hot-toast variants</p>

      <div className="flex flex-col gap-8">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.items.map((item) => (
                <Button key={item.label} variant={item.variant} onClick={item.onClick}>
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
