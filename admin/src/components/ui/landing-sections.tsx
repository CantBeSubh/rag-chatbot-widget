"use client"

import { PricingTable } from "@clerk/nextjs"
import type { LucideIcon } from "lucide-react"
import { Code2, Database, Layers, MessageSquare, Shield, SlidersHorizontal } from "lucide-react"

const features: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Database,
    title: "Knowledge Sources",
    description:
      "Upload documents or paste URLs. Wizz handles chunking, deduplication, and vector indexing automatically.",
  },
  {
    icon: Code2,
    title: "Embeddable Widget",
    description: "One script tag. Drop it on any site and your AI chatbot is live in under a minute.",
  },
  {
    icon: MessageSquare,
    title: "Chat Logs",
    description: "Every conversation is logged. Review gaps, audit responses, and improve your knowledge base over time.",
  },
  {
    icon: SlidersHorizontal,
    title: "Model Configuration",
    description: "Tune the system prompt, adjust temperature, and control how your chatbot responds to users.",
  },
  {
    icon: Shield,
    title: "Security & Rate Limiting",
    description: "Domain allowlisting, per-tenant rate limits, and isolated knowledge bases keep things safe.",
  },
  {
    icon: Layers,
    title: "Managed Infrastructure",
    description: "Vector search, chunking, and reranking handled for you. Focus on your product, not the plumbing.",
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="pb-24 pt-36 px-8 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs text-white/40 tracking-widest uppercase mb-3">Features</p>
        <h2 className="text-3xl font-light text-white mb-10 max-w-xs leading-tight">
          Everything your knowledge base needs
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="group">
              <div className="w-6 h-6 mb-4 text-white/30 group-hover:text-olive-400 transition-colors duration-200">
                <Icon className="w-full h-full" strokeWidth={1.5} />
              </div>
              <h3 className="text-sm font-medium text-white/90 mb-2">{title}</h3>
              <p className="text-xs font-light text-white/50 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function PricingSection() {
  return (
    <section id="pricing" className="py-12 px-8">
      <div className="max-w-4xl mx-auto">
        <p className="text-xs text-white/40 tracking-widest uppercase mb-3">Pricing</p>
        <h2 className="text-3xl font-light text-white mb-8">Simple, transparent pricing</h2>
        <PricingTable />
      </div>
    </section>
  )
}
