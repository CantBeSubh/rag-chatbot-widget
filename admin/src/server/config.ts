"use server"

export type WidgetConfig = {
  bot_name: string
  color: string
  placeholder: string
  allowed_domains: string[]
}

async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const response = await fetch(`${apiUrl}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export async function getConfig(): Promise<WidgetConfig> {
  try {
    return await apiFetch<WidgetConfig>("/config")
  } catch (error) {
    // Return defaults if 404 or empty
    return {
      bot_name: "Your Bot",
      color: "#6366f1",
      placeholder: "Ask me anything...",
      allowed_domains: [],
    }
  }
}

export async function updateConfig(config: WidgetConfig): Promise<{ saved: boolean }> {
  const result = await apiFetch<{ saved: boolean }>("/config", {
    method: "PUT",
    body: JSON.stringify(config),
  })
  return result
}
