"use client"

import { useState, useEffect } from "react"
import { useForm, UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { getConfig, updateConfig, WidgetConfig } from "@/server/config"

const schema = z.object({
  bot_name: z.string().min(1, "Bot name is required").max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
  placeholder: z.string().min(1, "Placeholder is required").max(100),
  allowed_domains: z.array(z.string()),
})

export type ConfigFormData = z.infer<typeof schema>

interface UseConfigPageReturn {
  form: UseFormReturn<ConfigFormData>
  preview: Partial<WidgetConfig>
  onSubmit: (data: ConfigFormData) => Promise<void>
  saving: boolean
  isLoading: boolean
}

export function useConfigPage(): UseConfigPageReturn {
  const [saving, setSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const form = useForm<ConfigFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      bot_name: "",
      color: "#6366f1",
      placeholder: "",
      allowed_domains: [],
    },
  })

  // Load initial config on mount
  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true)
      try {
        const config = await getConfig()
        form.reset(config)
      } catch (error) {
        console.error("Failed to load config:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [form])

  // Watch form values for live preview
  const watchedValues = form.watch()
  const preview: Partial<WidgetConfig> = {
    bot_name: watchedValues.bot_name,
    color: watchedValues.color,
    placeholder: watchedValues.placeholder,
    allowed_domains: watchedValues.allowed_domains,
  }

  const onSubmit = async (data: ConfigFormData) => {
    setSaving(true)
    try {
      await updateConfig(data)
      // Optionally show success toast here
    } catch (error) {
      console.error("Failed to save config:", error)
      // Optionally show error toast here
    } finally {
      setSaving(false)
    }
  }

  return {
    form,
    preview,
    onSubmit,
    saving,
    isLoading,
  }
}
