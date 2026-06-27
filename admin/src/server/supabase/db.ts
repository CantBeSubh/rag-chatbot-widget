import { createClient } from "@supabase/supabase-js"

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    db: {
      schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA!,
    },
  }
)
