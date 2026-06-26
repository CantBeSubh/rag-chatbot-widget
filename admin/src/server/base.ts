"use server"

import { cookies } from "next/headers"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const jar = await cookies()
  const apiKey = jar.get("rag_api_key")?.value ?? ""

  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...init.headers,
    },
  })
}
