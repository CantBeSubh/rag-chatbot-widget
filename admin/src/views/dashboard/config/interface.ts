import { UseFormReturn } from "react-hook-form"

import { z } from "zod"

import { WidgetConfig } from "@/server/config"
const DOMAIN_REGEX = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export const schema = z.object({
  bot_name: z.string().min(1, "Bot name is required").max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
  placeholder: z.string().min(1, "Placeholder is required").max(100),
  allowed_domains: z.array(z.string().regex(DOMAIN_REGEX)),
})

export type ConfigFormData = z.infer<typeof schema>

export interface UseConfigPageReturn {
  form: UseFormReturn<ConfigFormData>
  preview: Partial<WidgetConfig>
  onSubmit: (data: ConfigFormData) => Promise<void>
  saving: boolean
  isLoading: boolean
}
