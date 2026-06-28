"use client"

import { motion } from "framer-motion"
import { Brain, MessageSquare, Zap, FileText, Network, RotateCcw } from "lucide-react"
import { SectionBackground } from "./backgrounds"

const FEATURES = [
  {
    icon: <Brain className="h-6 w-6" />,
    title: "6 AI Study Tools",
    desc: "From a single PDF, instantly generate smart summaries, comprehensive study guides, organized notes, flashcards, quizzes, and visual mind maps — all in under 60 seconds.",
    color: "from-teal-500 to-cyan-400",
    badge: null,
  },
  {
    icon: <RotateCcw className="h-6 w-6" />,
    title: "Active Recall & Spaced Repetition",
    desc: "Cement knowledge with our 4-layer recall system: Absorb → Recognize → Retrieve → Mastered. Powered by the SM-2 algorithm, the same science used by top memory champions.",
    color: "from-emerald-500 to-teal-400",
    badge: "Signature Feature",
  },
  {
    icon: <MessageSquare className="h-6 w-6" />,
    title: "Intelligent Document Chat",
    desc: "Ask anything about your documents and get instant, contextual answers. Like a personal tutor who has read every page — powered by Gemini's 250K token context window.",
    color: "from-blue-500 to-indigo-400",
    badge: null,
  },
  {
    icon: <Network className="h-6 w-6" />,
    title: "Interactive Mind Maps",
    desc: "Visualize concepts and their connections as interactive node graphs. Pan, zoom, explore — and sync mind map nodes directly into your active recall review queue.",
    color: "from-violet-500 to-indigo-400",
    badge: null,
  },
  {
    icon: <Zap className="h-6 w-6" />,
    title: "Lightning-Fast Generation",
    desc: "Complete study materials ready in under a minute. No waiting, no manual work — just upload and watch AI create everything you need to excel.",
    color: "from-amber-500 to-orange-400",
    badge: null,
  },
  {
    icon: <FileText className="h-6 w-6" />,
    title: "Export Anywhere",
    desc: "Take your learning offline with professional PDF and DOCX exports. Beautifully formatted study materials you can print, share, or access anywhere.",
    color: "from-rose-500 to-red-400",
    badge: null,
  },
] as const

function FeatureCard({ feature, index }: { feature: (typeof FEATURES)[number]; index: number }) {
  const isHighlighted = feature.badge !== null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className="group relative h-full"
    >
      <div
        className={`relative h-full overflow-hidden rounded-2xl border p-6 backdrop-blur-sm transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-[1.02] ${
          isHighlighted
            ? "border-teal-400/40 bg-gradient-to-br from-teal-500/5 to-emerald-500/5 dark:from-teal-500/10 dark:to-emerald-500/10 hover:border-teal-400/60"
            : "border-border/50 bg-white/95 dark:bg-card/80 hover:border-primary/40"
        }`}
      >
        {/* Highlighted badge */}
        {feature.badge && (
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-teal-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" />
            {feature.badge}
          </div>
        )}

        {/* Icon */}
        <div
          className={`mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} text-white shadow-lg`}
        >
          {feature.icon}
        </div>

        {/* Content */}
        <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>
      </div>
    </motion.div>
  )
}

export default function FeaturesSection() {
  return (
    <section id="features" className="relative py-16 sm:py-24 overflow-hidden w-full">
      <SectionBackground />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm backdrop-blur-sm">
            <Brain className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">Built for Deep Learning</span>
          </div>

          <h2 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Everything You Need to{" "}
            <span className="bg-gradient-to-r from-primary via-amber-500 to-primary bg-clip-text text-transparent">
              Master Anything
            </span>
          </h2>

          <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
            Not just study tools — a complete learning system. From first read to long-term retention.
          </p>
        </motion.div>

        {/* Feature cards grid */}
        <div className="mt-16 grid grid-cols-1 gap-6 sm:mt-20 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {FEATURES.map((feature, index) => (
            <FeatureCard key={index} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}
