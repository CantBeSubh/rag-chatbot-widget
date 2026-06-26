"use client"

import { Controller } from "react-hook-form"

import { Loader2 } from "lucide-react"

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
import { Skeleton } from "@/components/ui/skeleton"
import { WidgetPreview } from "@/views/dashboard/config/_components/widget-preview"

import { AllowedDomainsInput } from "./_components/allowed-domains-input/view"
import { useConfigPage } from "./logic"

function ConfigSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_auto]">
        <Card className="max-w-md">
          <CardHeader>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
        <Card size="sm" className="w-[280px]">
          <CardHeader>
            <Skeleton className="h-5 w-28" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[320px] w-full" />
          </CardContent>
        </Card>
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
        <h1 className="text-2xl font-semibold">Widget Configuration</h1>
        <p className="text-sm text-muted-foreground">
          Customize how your chatbot appears on embedded sites
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_auto]">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              Changes take effect after saving
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)}>
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

                <Controller
                  name="color"
                  control={form.control}
                  render={({ field, fieldState }) => {
                    const pickerValue = /^#[0-9a-fA-F]{6}$/.test(field.value)
                      ? field.value
                      : "#6366f1"

                    return (
                      <Field data-invalid={!!fieldState.error}>
                        <FieldLabel htmlFor="color">Primary Color</FieldLabel>
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            id="color"
                            value={pickerValue}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            className="h-9 w-12 shrink-0 cursor-pointer p-1"
                          />
                          <Input
                            value={field.value}
                            placeholder="#6366f1"
                            className="flex-1"
                            onChange={(e) => field.onChange(e.target.value)}
                            onBlur={field.onBlur}
                          />
                        </div>
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )
                  }}
                />

                <Field data-invalid={!!errors.placeholder}>
                  <FieldLabel htmlFor="placeholder">Placeholder Text</FieldLabel>
                  <Input
                    id="placeholder"
                    {...form.register("placeholder")}
                    placeholder="Ask me anything..."
                  />
                  <FieldError errors={[errors.placeholder]} />
                </Field>

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

              <Button
                type="submit"
                disabled={saving}
                className="mt-6 w-full"
              >
                {saving && <Loader2 className="animate-spin" />}
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card size="sm" className="h-fit w-fit">
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
            <CardDescription>Updates as you edit</CardDescription>
          </CardHeader>
          <CardContent>
            <WidgetPreview config={preview} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
