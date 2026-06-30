"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { useUser } from "@clerk/nextjs"
import { Heatmap } from "@paper-design/shaders-react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
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
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [])

  const handleSubmit = async () => {
    await user?.reload()
    router.push("/dashboard/config")
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden">
      <Heatmap
        className="absolute inset-0"
        width="100%"
        height="100%"
        image="https://shaders.paper.design/images/logos/diamond.svg"
        colors={["#9b8046", "#ffffff"]}
        colorBack="#000000"
        contour={0.5}
        angle={0}
        noise={0.75}
        innerGlow={0.5}
        outerGlow={0.5}
        speed={loading ? 0.5 : 0}
        scale={0.75}
      />

      <div className="relative z-10 flex flex-col items-center gap-6 rounded-xl">
        {loading ? (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-white">Creating your account</h2>
              <p className="text-sm text-white/60">
                Setting up your workspace. This will only take a few seconds.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-white">You&apos;re all set</h2>
              <p className="text-sm text-white/60">Your workspace is ready to use.</p>
            </div>
            <Button onClick={handleSubmit} variant="secondary">
              Continue to Dashboard
            </Button>
            {error && <p className="text-sm text-red-400">Error: {error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
