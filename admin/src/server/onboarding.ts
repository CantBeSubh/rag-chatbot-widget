"use server"

import { auth, clerkClient } from "@clerk/nextjs/server"

import { supabase } from "./supabase/db"

export async function ensureTenant() {
  // 1. Check if its an authenticated request
  // 2. Check if there's row against unique email, if exists, set metadata
  // 3. If not, continue with tenant creation, and metadata set
  const client = await clerkClient()
  const { isAuthenticated, userId } = await auth()

  if (!isAuthenticated) {
    throw Error("not authenticated")
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      user_id: userId
    })
    .select("id, api_key")
    .single()

  if (tenantError?.code === "23505") {
    console.log("USER ALREADY EXISTS")
    const { data, error } = await supabase
      .from("tenants")
      .select("id, api_key")
      .eq("user_id", userId)
      .single()

    try {
      if (error) throw error
      const publicMetadata = {
        apikey: data.api_key
      }
      const res = await client.users.updateUserMetadata(userId, {
        publicMetadata,
      })
      return { message: res.publicMetadata }
    } catch (err) {
      console.log("createTenant Error: ", err)
      throw err
    }
  }
  else if (tenantError) {
    throw new Error(`Failed to create tenant: ${tenantError.message}`)
  }

  const { error: widgetError } = await supabase
    .from("widget_config")
    .insert({
      tenant_id: tenant.id,
    })

  if (widgetError) {
    await supabase.from("tenants").delete().eq("id", tenant.id)

    throw new Error(`Failed to create widget config: ${widgetError.message}`)
  }

  const publicMetadata = {
    apikey: tenant.api_key
  }

  try {
    const res = await client.users.updateUserMetadata(userId, {
      publicMetadata,
    })
    return { message: res.publicMetadata }
  } catch (err) {
    console.log("createTenant Error: ", err)
    throw err
  }
}
