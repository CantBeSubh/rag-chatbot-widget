"use server"
import { auth } from "@clerk/nextjs/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {

  const { isAuthenticated } = await auth()

  if (!isAuthenticated) {
    throw Error("not authenticated")
  }

  const apiKey = (await auth()).sessionClaims?.metadata.apikey

  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...init.headers,
    },
  })
}
