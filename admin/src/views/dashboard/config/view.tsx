"use client"

import { useConfigPage } from "./logic"
import { WidgetPreview } from "@/components/widget-preview"
import { AllowedDomainsInput } from "./_components/allowed-domains-input/view"
import { Input } from "@/components/ui/input"

export function ConfigView() {
  const { form, preview, onSubmit, saving, isLoading } = useConfigPage()

  if (isLoading) {
    return <div className="p-8">Loading configuration...</div>
  }

  return (
    <div className="grid grid-cols-[1fr_auto] gap-8 p-8">
      {/* Left column: Form */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-md space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Bot Name
          </label>
          <Input
            {...form.register("bot_name")}
            placeholder="Your Bot"
            className="w-full"
          />
          {form.formState.errors.bot_name && (
            <p className="text-sm text-red-600 mt-1">
              {form.formState.errors.bot_name.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Primary Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              {...form.register("color")}
              className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
            />
            <Input
              {...form.register("color")}
              placeholder="#6366f1"
              className="flex-1"
              onChange={(e) => {
                const value = e.target.value
                if (value.match(/^#[0-9a-fA-F]{6}$/)) {
                  form.setValue("color", value)
                }
              }}
            />
          </div>
          {form.formState.errors.color && (
            <p className="text-sm text-red-600 mt-1">
              {form.formState.errors.color.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Placeholder Text
          </label>
          <Input
            {...form.register("placeholder")}
            placeholder="Ask me anything..."
            className="w-full"
          />
          {form.formState.errors.placeholder && (
            <p className="text-sm text-red-600 mt-1">
              {form.formState.errors.placeholder.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Allowed Domains
          </label>
          <AllowedDomainsInput
            value={form.watch("allowed_domains")}
            onChange={(domains) => form.setValue("allowed_domains", domains)}
          />
          {form.formState.errors.allowed_domains && (
            <p className="text-sm text-red-600 mt-1">
              {form.formState.errors.allowed_domains.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
        >
          {saving && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          Save Changes
        </button>
      </form>

      {/* Right column: Live preview */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700">Live Preview</h3>
        <WidgetPreview config={preview} />
      </div>
    </div>
  )
}
