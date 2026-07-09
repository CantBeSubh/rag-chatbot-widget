"use client"

import { Header, HeroContent, PulsingCircle, ShaderBackground, VideoEmbed } from "@/components/ui/shaders-hero-section"

export default function Home() {
  return (
    <ShaderBackground>
      <Header />
      <HeroContent />
      <VideoEmbed />
      <PulsingCircle />
    </ShaderBackground>
  )
}
