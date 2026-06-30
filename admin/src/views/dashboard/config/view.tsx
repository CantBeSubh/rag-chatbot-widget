"use client"

import { Controller } from "react-hook-form"

import { Bot, Loader2, Monitor, Palette, Settings2, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { widgetPalette } from "@/lib/widget-palette"
import { WidgetPreview } from "@/views/dashboard/config/_components/widget-preview"

import { AllowedDomainsInput } from "./_components/allowed-domains-input/view"
import { ColorPickerField } from "./_components/color-picker-field"
import { useConfigPage } from "./logic"

function ConfigSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="h-[600px] w-[400px]" />
      </div>
    </div>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3 pb-2">
      <div className="mt-0.5 rounded-md bg-muted p-1.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export function ConfigView() {
  const { form, preview, onSubmit, saving, isLoading } = useConfigPage()
  const { errors } = form.formState

  if (isLoading) {
    return <ConfigSkeleton />
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Widget Configuration
        </h1>
        <p className="text-sm text-muted-foreground">
          Customize how your chatbot appears on embedded sites
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Identity */}
          <Card>
            <CardHeader className="pb-3">
              <SectionHeader
                icon={Settings2}
                title="Identity"
                description="How your bot presents itself to users"
              />
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={!!errors.bot_name}>
                  <FieldLabel htmlFor="bot_name">Bot Name</FieldLabel>
                  <Input
                    id="bot_name"
                    {...form.register("bot_name")}
                    placeholder="Your Bot"
                  />
                  <FieldError errors={[errors.bot_name]} />
                </Field>

                <Field data-invalid={!!errors.placeholder}>
                  <FieldLabel htmlFor="placeholder">
                    Input Placeholder
                  </FieldLabel>
                  <Input
                    id="placeholder"
                    {...form.register("placeholder")}
                    placeholder="Ask me anything..."
                  />
                  <FieldDescription>
                    Shown in the chat input before the user types
                  </FieldDescription>
                  <FieldError errors={[errors.placeholder]} />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card>
            <CardHeader className="pb-3">
              <SectionHeader
                icon={Palette}
                title="Appearance"
                description="Colors used to render the widget"
              />
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Controller
                  name="color"
                  control={form.control}
                  render={({ field, fieldState }) => {
                    const isValidHex = /^#[0-9a-fA-F]{6}$/.test(field.value)
                    const palette = isValidHex
                      ? widgetPalette(field.value)
                      : null

                    return (
                      <Field data-invalid={!!fieldState.error}>
                        <FieldLabel htmlFor="color">Primary Color</FieldLabel>
                        <ColorPickerField
                          id="color"
                          value={field.value}
                          placeholder="#6366f1"
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                        />
                        {palette && (
                          <div className="flex items-center gap-2 mt-2">
                            <ColorChip
                              label="Button / Message"
                              bg={palette["--primary"]}
                              fg={palette["--primary-foreground"]}
                            />
                            <ColorChip
                              label="Citation chip"
                              bg={palette["--primary"] + "1a"}
                              fg={palette["--primary"]}
                            />
                          </div>
                        )}
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )
                  }}
                />

                <Controller
                  name="background_color"
                  control={form.control}
                  render={({ field, fieldState }) => {
                    const isValidHex = /^#[0-9a-fA-F]{6}$/.test(field.value)
                    const palette = isValidHex
                      ? widgetPalette("#6366f1", field.value)
                      : null

                    return (
                      <Field data-invalid={!!fieldState.error}>
                        <FieldLabel htmlFor="background_color">
                          Background Color
                        </FieldLabel>
                        <ColorPickerField
                          id="background_color"
                          value={field.value}
                          placeholder="#ffffff"
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                        />
                        {palette && (
                          <div className="flex items-center gap-2 mt-2">
                            <ColorChip
                              label="Panel bg"
                              bg={palette["--background"]}
                              fg={palette["--foreground"]}
                              border={palette["--border"]}
                            />
                            <ColorChip
                              label="Bot message"
                              bg={palette["--muted"]}
                              fg={palette["--muted-foreground"]}
                            />
                          </div>
                        )}
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )
                  }}
                />
              </FieldGroup>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader className="pb-3">
              <SectionHeader
                icon={ShieldCheck}
                title="Security"
                description="Control where your widget can be embedded"
              />
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Controller
                  name="allowed_domains"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={!!fieldState.error}>
                      <FieldLabel htmlFor="allowed_domains">
                        Allowed Domains
                      </FieldLabel>
                      <AllowedDomainsInput
                        value={field.value}
                        onChange={field.onChange}
                      />
                      <FieldDescription>
                        Only listed domains can embed the widget
                      </FieldDescription>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              </FieldGroup>
            </CardContent>
          </Card>

          {/* LLM Settings */}
          <Card>
            <CardHeader className="pb-3">
              <SectionHeader
                icon={Bot}
                title="LLM Settings"
                description="Control the model's behavior when generating answers"
              />
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={!!errors.llm_config?.system_prompt}>
                  <FieldLabel htmlFor="system_prompt">System Prompt</FieldLabel>
                  <Textarea
                    id="system_prompt"
                    {...form.register("llm_config.system_prompt")}
                    rows={5}
                    placeholder="You are a helpful assistant..."
                    className="resize-y"
                  />
                  <FieldDescription>
                    Persona and behavior instructions. The knowledge-base context is always appended automatically.
                  </FieldDescription>
                  <FieldError errors={[errors.llm_config?.system_prompt]} />
                </Field>

                <Field data-invalid={!!errors.llm_config?.temperature}>
                  <FieldLabel htmlFor="temperature">Temperature</FieldLabel>
                  <Input
                    id="temperature"
                    type="number"
                    min={0}
                    max={2}
                    step={0.01}
                    {...form.register("llm_config.temperature", { valueAsNumber: true })}
                  />
                  <FieldDescription>
                    Controls randomness — 0 is deterministic, higher values are more creative (max 2).
                  </FieldDescription>
                  <FieldError errors={[errors.llm_config?.temperature]} />
                </Field>

                <Field data-invalid={!!errors.llm_config?.max_tokens}>
                  <FieldLabel htmlFor="max_tokens">Max Tokens</FieldLabel>
                  <Input
                    id="max_tokens"
                    type="number"
                    min={64}
                    max={8192}
                    step={1}
                    {...form.register("llm_config.max_tokens", { valueAsNumber: true })}
                  />
                  <FieldDescription>
                    Maximum number of tokens the model may generate per response (64–8192).
                  </FieldDescription>
                  <FieldError errors={[errors.llm_config?.max_tokens]} />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <div className="pt-2">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>

        {/* Live Preview */}
        <div className="hidden lg:block">
          <Card className="sticky top-6 h-fit">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">
                  Live Preview
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Updates as you edit
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              <WidgetPreview config={preview} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ColorChip({
  label,
  bg,
  fg,
  border,
}: {
  label: string
  bg: string
  fg: string
  border?: string
}) {
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset"
      style={{
        backgroundColor: bg,
        color: fg,
        ringColor: border ?? "transparent",
        borderColor: border,
        borderWidth: border ? 1 : 0,
        borderStyle: border ? "solid" : undefined,
      }}
    >
      {label}
    </span>
  )
}
