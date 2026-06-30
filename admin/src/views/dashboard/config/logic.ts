"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"

import { zodResolver } from "@hookform/resolvers/zod"

import { getConfig, updateConfig, WidgetConfig } from "@/server/config"

import { ConfigFormData, schema, UseConfigPageReturn } from "./interface"

export function useConfigPage(): UseConfigPageReturn {
  const [saving, setSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadedConfig, setLoadedConfig] = useState<WidgetConfig | null>(null)

  const form = useForm<ConfigFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      bot_name: "",
      color: "#6366f1",
      background_color: "#ffffff",
      placeholder: "",
      allowed_domains: [],
    },
  })

  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true)
      try {
        const config = await getConfig()
        setLoadedConfig(config)
        form.reset(config)
      } catch (error) {
        console.error("Failed to load config:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [form])

  // eslint-disable-next-line react-hooks/incompatible-library
  const watchedValues = form.watch()

  const [debouncedBotName, setDebouncedBotName] = useState(watchedValues.bot_name)
  const [debouncedPlaceholder, setDebouncedPlaceholder] = useState(watchedValues.placeholder)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedBotName(watchedValues.bot_name), 400)
    return () => clearTimeout(t)
  }, [watchedValues.bot_name])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPlaceholder(watchedValues.placeholder), 400)
    return () => clearTimeout(t)
  }, [watchedValues.placeholder])

  const preview: Partial<WidgetConfig> = {
    bot_name: debouncedBotName,
    color: watchedValues.color,
    background_color: watchedValues.background_color,
    placeholder: debouncedPlaceholder,
    allowed_domains: watchedValues.allowed_domains,
  }

  const onSubmit = async (data: ConfigFormData) => {
    setSaving(true)
    try {
      const fullConfig: WidgetConfig = {
        ...data,
        llm_config: loadedConfig?.llm_config || {
          system_prompt:
            "You are a helpful assistant. Answer the user's question using ONLY the context " +
            'provided below. If the answer is not in the context, say "I don\'t have information ' +
            'about that in my knowledge base."\n\nDo not make up information. Always be concise and direct.',
          temperature: 0.1,
          max_tokens: 1024,
        },
      }
      await updateConfig(fullConfig)
      // TODO: Optionally show success toast here
    } catch (error) {
      console.error("Failed to save config:", error)
      // TODO: Optionally show error toast here
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
