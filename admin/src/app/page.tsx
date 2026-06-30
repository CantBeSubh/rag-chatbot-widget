"use client"

import { FeaturesSection, PricingSection } from "@/components/ui/landing-sections"
import { Header, HeroContent, PulsingCircle, ShaderBackground } from "@/components/ui/shaders-hero-section"

export default function Home() {
  return (
    <>
      <ShaderBackground>
        <Header />
        <HeroContent />
        <PulsingCircle />
      </ShaderBackground>
      <FeaturesSection />
      <PricingSection />
    </>
  )
}
