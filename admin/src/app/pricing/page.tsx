"use client"

import { GrainGradient } from "@paper-design/shaders-react"

import { FeaturesSection, PricingSection } from "@/components/ui/landing-sections"

export default function PricingPage() {
  return (
    <div className="relative min-h-screen ">
      <div className="absolute inset-0 -z-10">
        <GrainGradient
          style={{ height: "100%", width: "100%" }}
          colorBack="hsl(0, 0%, 0%)"
          softness={0.76}
          intensity={0.45}
          noise={0}
          shape="corners"
          offsetX={0}
          offsetY={0}
          scale={1}
          rotation={0}
          speed={1}
          colors={["hsl(244, 74%, 45%)", "hsl(38, 14%, 40%)", "hsl(258, 55%, 35%)"]}
        />
      </div>
      <div className="backdrop-blur-3xl">
        <FeaturesSection />
        <PricingSection />
      </div>
    </div>
  )
}
