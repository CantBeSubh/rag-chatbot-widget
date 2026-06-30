"use client"

import { PricingTable } from "@clerk/nextjs"
import { Database, MessageSquare, Shield, SlidersHorizontal } from "lucide-react"

export function FeaturesSection() {
  return (
    <section id="features" className="pb-24 pt-36 px-8">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs text-white/40 tracking-widest uppercase mb-3">Features</p>
        <h2 className="text-3xl font-light text-white mb-10 max-w-xs leading-tight">
          Everything your knowledge base needs
        </h2>

        <div className="grid grid-cols-6 gap-3">
          {/* Card 1: Embeddable Widget — code snippet */}
          <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] p-8 flex flex-col min-h-[280px]">
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full border border-white/[0.08] rounded-xl bg-black/40 overflow-hidden">
                <div className="px-3 py-2 border-b border-white/[0.06] flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-white/10" />
                  <div className="w-2 h-2 rounded-full bg-white/10" />
                  <div className="w-2 h-2 rounded-full bg-white/10" />
                </div>
                <div className="px-4 py-4 font-mono text-xs leading-6">
                  <div>
                    <span className="text-white/25">&lt;</span>
                    <span className="text-white/70">script</span>
                  </div>
                  <div className="pl-4">
                    <span className="text-white/40">src</span>
                    <span className="text-white/20">=</span>
                    <span className="text-white/50">&quot;https://cdn.wizz.ai/w.js&quot;</span>
                  </div>
                  <div>
                    <span className="text-white/25">/&gt;</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Script Tag</h3>
              <p className="text-sm text-white/50 mt-1 leading-relaxed">
                Drop it on any site. Your AI chatbot is live in under a minute.
              </p>
            </div>
          </div>

          {/* Card 2: Knowledge Sources — concentric icon */}
          <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] p-8 flex flex-col items-center justify-between min-h-[280px]">
            <div className="flex-1 flex items-center justify-center">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-28 h-28 rounded-full border border-white/10" />
                <div className="absolute w-20 h-20 rounded-full border border-white/15" />
                <div className="w-14 h-14 rounded-full border border-white/20 flex items-center justify-center">
                  <Database className="w-6 h-6 text-white/60" strokeWidth={1} />
                </div>
                <div className="absolute w-28 flex items-center justify-center">
                  <div className="w-full h-px bg-white/20" />
                </div>
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-base font-medium text-white mb-2">Knowledge Sources</h3>
              <p className="text-sm text-white/50 leading-relaxed">
                Upload docs or paste URLs. Chunking, deduplication, and vector indexing handled automatically.
              </p>
            </div>
          </div>

          {/* Card 3: Chat Logs — activity graph */}
          <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] p-8 flex flex-col justify-between min-h-[280px]">
            <div className="flex items-center justify-between text-xs text-white/30 mb-2">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" />
                Conversations
              </span>
              <span>1,284 / week</span>
            </div>
            <div className="flex-1 flex items-end py-2">
              <svg viewBox="0 0 220 64" className="w-full text-white/35" preserveAspectRatio="none">
                <polyline
                  points="0,58 25,50 50,54 75,36 95,42 115,26 138,30 158,18 178,11 200,6 220,2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="mt-3">
              <h3 className="text-base font-medium text-white mb-1">Chat Logs</h3>
              <p className="text-sm text-white/50 leading-relaxed">
                Every conversation logged. Review gaps, audit responses, and improve over time.
              </p>
            </div>
          </div>

          {/* Card 4: Security — wide, with browser mockup */}
          <div className="col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] p-8 flex gap-6 min-h-[300px] overflow-hidden">
            <div className="flex flex-col justify-between z-10 flex-shrink-0">
              <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white/50" strokeWidth={1} />
              </div>
              <div>
                <h3 className="text-base font-medium text-white mb-2">Security & Rate Limiting</h3>
                <p className="text-sm text-white/50 leading-relaxed max-w-[190px]">
                  Domain allowlisting, per-tenant rate limits, and isolated knowledge bases.
                </p>
              </div>
            </div>
            <div className="flex-1 flex items-stretch justify-end opacity-20">
              <div className="w-44 border border-white/50 rounded-lg overflow-hidden flex flex-col">
                <div className="bg-white/10 px-2 py-1.5 flex items-center gap-1 flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-white/40" />
                  <div className="w-2 h-2 rounded-full bg-white/40" />
                  <div className="w-2 h-2 rounded-full bg-white/40" />
                </div>
                <div className="p-3 space-y-1.5 flex-1">
                  <div className="h-1 bg-white/30 rounded-full" />
                  <div className="h-1 bg-white/30 rounded-full w-4/5" />
                  <div className="h-1 bg-white/30 rounded-full w-2/3" />
                  <div className="h-1 bg-white/30 rounded-full w-3/4" />
                  <div className="h-1 bg-white/30 rounded-full w-1/2" />
                  <div className="h-1 bg-white/30 rounded-full w-3/5" />
                  <div className="h-1 bg-white/30 rounded-full w-4/5" />
                  <div className="h-1 bg-white/30 rounded-full w-2/3" />
                </div>
              </div>
            </div>
          </div>

          {/* Card 5: Model Config — wide, with config badges */}
          <div className="col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] p-8 flex justify-between min-h-[300px]">
            <div className="flex flex-col justify-between">
              <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center">
                <SlidersHorizontal className="w-5 h-5 text-white/50" strokeWidth={1} />
              </div>
              <div>
                <h3 className="text-base font-medium text-white mb-2">Model Configuration</h3>
                <p className="text-sm text-white/50 leading-relaxed max-w-[190px]">
                  Tune the system prompt, adjust temperature, and control how your chatbot responds.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 justify-center ml-6">
              {[
                { label: "System Prompt", val: "Custom" },
                { label: "Temperature", val: "0.7" },
                { label: "Max Tokens", val: "2048" },
              ].map(({ label, val }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 min-w-[160px]"
                >
                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-white/40" />
                  </div>
                  <span className="text-xs text-white/50 flex-1">{label}</span>
                  <span className="text-xs text-white/80 font-mono">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function PricingSection() {
  return (
    <section id="pricing" className="py-12 px-8">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs text-white/40 tracking-widest uppercase mb-3">Pricing</p>
        <h2 className="text-3xl font-light text-white mb-8">Simple, transparent pricing</h2>
        <PricingTable />
      </div>
    </section>
  )
}
