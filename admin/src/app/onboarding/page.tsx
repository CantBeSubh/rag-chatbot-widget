"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { useUser } from "@clerk/nextjs"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ensureTenant } from "@/server/onboarding"

export default function OnboardingComponent() {
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const { user } = useUser()
  const router = useRouter()

  useEffect(() => {
    async function bootstrap() {
      try {
        await ensureTenant()
      } catch (err) {
        setError(`${err}`)
      }
      finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [])

  const handleSubmit = async () => {
    await user?.reload()
    router.push("/dashboard/config")
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="text-primary h-8 w-8 animate-spin" />

            <div className="space-y-1 text-center">
              <h2 className="text-lg font-semibold">
                Creating your account
              </h2>

              <p className="text-muted-foreground text-sm">
                Setting up your workspace. This will only take a few seconds.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="size-screen flex justify-center items-center">
      <Button onClick={handleSubmit} variant="secondary">Continue to Dashboard</Button>
      {error && <p className="text-red-600">Error: {error}</p>}
    </div>
  )
}
