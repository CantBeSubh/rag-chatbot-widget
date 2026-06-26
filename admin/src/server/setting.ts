"use server"

import { cookies } from "next/headers"

export async function getApiFromCookie() {
  const jar = await cookies()
  const apiKey = jar.get("rag_api_key")?.value ?? ""

  return apiKey
}
