import { WidgetView } from "@/views/widget/widget-view"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000"

interface Props {
  searchParams: Promise<{ apiKey?: string; botName?: string }>
}

export default async function WidgetPage({ searchParams }: Props) {
  const { apiKey, botName } = await searchParams

  if (!apiKey) {
    return (
      <p className="p-4 text-sm text-destructive">Missing apiKey URL parameter.</p>
    )
  }

  return (
    <WidgetView
      apiKey={apiKey}
      backendUrl={BACKEND_URL}
      botName={botName ?? "Assistant"}
    />
  )
}
