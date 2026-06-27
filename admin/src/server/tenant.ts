import { refresh } from "next/cache"

import { auth, clerkClient } from "@clerk/nextjs/server"

import { apiFetch } from "./base"

export async function deleteAll() {
  const { isAuthenticated, userId } = await auth()

  if (!isAuthenticated) {
    throw Error("not authenticated")
  }

  const client = await clerkClient()
  await client.users.deleteUser(userId)
  await apiFetch("/tenant", { method: "DELETE" })

  return refresh()
}
