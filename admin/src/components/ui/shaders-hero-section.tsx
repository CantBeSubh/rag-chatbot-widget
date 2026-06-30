"use client"

import type React from "react"
import { useRef } from "react"
import Link from "next/link"

import { SignInButton, useAuth } from "@clerk/nextjs"
import { MeshGradient, PulsingBorder } from "@paper-design/shaders-react"
import { motion } from "framer-motion"

interface ShaderBackgroundProps {
  children: React.ReactNode
}

export function ShaderBackground({ children }: ShaderBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={containerRef} className="min-h-screen w-full relative overflow-hidden">
      {/* SVG Filters */}
      <svg className="absolute inset-0 w-0 h-0">
        <defs>
          <filter id="glass-effect" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence baseFrequency="0.005" numOctaves="1" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.3" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0.02
                      0 1 0 0 0.02
                      0 0 1 0 0.05
                      0 0 0 0.9 0"
              result="tint"
            />
          </filter>
          <filter id="gooey-filter" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
              result="gooey"
            />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* Background Shaders */}
      <MeshGradient
        className="absolute inset-0 w-full h-full"
        colors={["#0d0b09", "#1c1a12", "#a89f88", "#2c2819", "#3a3523"]}
        speed={0.3}
      />
      <MeshGradient
        className="absolute inset-0 w-full h-full opacity-60"
        colors={["#0d0b09", "#a89f88", "#4f46e5", "#0d0b09"]}
        speed={0.2}
      />

      {children}
    </div>
  )
}

export function PulsingCircle() {
  return (
    <div className="absolute bottom-8 right-8 z-30">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <PulsingBorder
          colors={["#BEECFF", "#E77EDC", "#FF4C3E", "#00FF88", "#FFD700", "#FF6B35", "#8A2BE2"]}
          colorBack="#00000000"
          speed={1.5}
          roundness={1}
          thickness={0.1}
          softness={0.2}
          intensity={5}
          spots={5}
          spotSize={0.1}
          pulse={0.1}
          smoke={0.5}
          smokeSize={4}
          scale={0.65}
          rotation={0}
          frame={9161408.251009725}
          style={{ width: "60px", height: "60px", borderRadius: "50%" }}
        />

        <motion.svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
          style={{ transform: "scale(1.6)" }}
        >
          <defs>
            <path id="circle" d="M 50, 50 m -38, 0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
          </defs>
          <text className="text-sm fill-white/80">
            <textPath href="#circle" startOffset="0%">
              Wizz AI • RAG Chatbot • Wizz AI • RAG Chatbot •
            </textPath>
          </text>
        </motion.svg>
      </div>
    </div>
  )
}

export function HeroContent() {
  return (
    <main className="absolute bottom-8 left-8 z-20 max-w-lg">
      <div className="text-left">
        <div
          className="inline-flex items-center px-3 py-1 rounded-full bg-white/5 backdrop-blur-sm mb-4 relative"
          style={{ filter: "url(#glass-effect)" }}
        >
          <div className="absolute top-0 left-1 right-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-full" />
          <span className="text-white/90 text-xs font-light tracking-widest relative z-10">RAG INFRASTRUCTURE · MANAGED · WIZZ</span>
        </div>

        <h1 className="text-5xl md:text-5xl md:leading-16 tracking-tight font-light text-white mb-4">
          Your knowledge
          <span className="font-bold italic font-serif"> base.</span>{" "}
          <span className="font-light text-indigo-300">Production ready.</span>
        </h1>

        <p className="text-xs font-light text-white/70 mb-4 leading-relaxed">
          Wizz AI manages the documents, URLs, and configuration behind your AI chatbot. Add sources, review logs, and tune responses, all from one dashboard.
        </p>

        {/* <div className="flex items-center gap-4 flex-wrap"> */}
        {/*   <Link */}
        {/*     href="/dashboard/sources" */}
        {/*     className="px-8 py-3 rounded-full bg-white text-black font-normal text-xs transition-all duration-200 hover:bg-white/90" */}
        {/*   > */}
        {/*     Open Dashboard → */}
        {/*   </Link> */}
        {/*   {isLoaded && !isSignedIn && ( */}
        {/*     <SignInButton> */}
        {/*       <button className="px-8 py-3 rounded-full bg-transparent border border-white/30 text-white font-normal text-xs transition-all duration-200 hover:bg-white/10 hover:border-white/50 cursor-pointer"> */}
        {/*         Sign in */}
        {/*       </button> */}
        {/*     </SignInButton> */}
        {/*   )} */}
        {/* </div> */}
      </div>
    </main>
  )
}

export function Header() {
  const { isLoaded, isSignedIn } = useAuth()

  return (
    <header className="relative z-20 flex items-center justify-between p-6">
      {/* Wizz wordmark */}
      <div className="flex items-center">
        <span className="text-white text-xl font-bold tracking-tight select-none">Wizz AI</span>
      </div>

      {/* Navigation */}
      <nav className="flex items-center space-x-2">
        <Link
          href="/pricing#features"
          className="text-white/80 hover:text-white text-xs font-light px-3 py-2 rounded-full hover:bg-white/10 transition-all duration-200"
        >
          Features
        </Link>
        <Link
          href="/pricing"
          className="text-white/80 hover:text-white text-xs font-light px-3 py-2 rounded-full hover:bg-white/10 transition-all duration-200"
        >
          Pricing
        </Link>
        <a
          href="#"
          className="text-white/80 hover:text-white text-xs font-light px-3 py-2 rounded-full hover:bg-white/10 transition-all duration-200"
        >
          Docs
        </a>
      </nav>

      {/* Auth CTA */}
      {isLoaded && isSignedIn ? (
        <Link
          href="/dashboard/sources"
          className="px-4 py-2 rounded-full bg-white text-black font-normal text-xs transition-all duration-300 hover:bg-white/90 h-8 flex items-center"
        >
          Dashboard
        </Link>
      ) : (
        <div id="gooey-btn" className="relative flex items-center group" style={{ filter: "url(#gooey-filter)" }}>
          <button className="absolute right-0 px-2.5 py-2 rounded-full bg-white text-black font-normal text-xs transition-all duration-300 hover:bg-white/90 cursor-pointer h-8 flex items-center justify-center -translate-x-10 group-hover:-translate-x-19 z-0">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M17 7H7M17 7V17" />
            </svg>
          </button>
          <SignInButton>
            <button className="px-4 py-2 rounded-full bg-white text-black font-normal text-xs transition-all duration-300 hover:bg-white/90 cursor-pointer h-8 flex items-center z-10">
              Sign In
            </button>
          </SignInButton>
        </div>
      )}
    </header>
  )
}
