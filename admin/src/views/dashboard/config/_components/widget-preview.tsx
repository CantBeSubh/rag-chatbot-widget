"use client"

import { useEffect, useRef } from "react"

import type { WidgetConfig } from "@/server/config"

interface WidgetPreviewProps {
  config: Partial<WidgetConfig>
}

export function WidgetPreview({ config }: WidgetPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const src = buildPreviewUrl(config)

  // Reload iframe src when config changes (color/botName updates require a new URL)
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.src = src
    }
  }, [src])

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title="Widget preview"
      width={380}
      height={560}
      style={{ border: "none", background: "transparent", borderRadius: "12px" }}
      allowTransparency
    />
  )
}

function buildPreviewUrl(config: Partial<WidgetConfig>): string {
  const url = new URL("/widget", window.location.origin)
  url.searchParams.set("mode", "preview")
  if (config.bot_name) url.searchParams.set("botName", config.bot_name)
  if (config.color) url.searchParams.set("color", config.color)
  if (config.background_color) url.searchParams.set("backgroundColor", config.background_color)
  if (config.placeholder) url.searchParams.set("placeholder", config.placeholder)
  return url.toString()
}
