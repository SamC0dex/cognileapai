"use client"

import { motion } from "framer-motion"
import { Brain, MessageSquare, Zap, Sparkles, FileText, Search } from "lucide-react"
import { SectionBackground } from "./backgrounds"

const FEATURES = [
  {
    icon: <Brain className="h-6 w-6" />,
    title: "AI-Powered Study Tools",
    desc: "Transform any document into comprehensive study guides, smart summaries, and organized notes in seconds. Our AI understands context and creates learning materials tailored to how you learn best.",
    color: "from-teal-500 to-cyan-400",
    glow: "rgba(20, 184, 166, 0.3)",
  },
  {
    icon: <MessageSquare className="h-6 w-6" />,
    title: "Intelligent Document Chat",
    desc: "Ask anything about your documents and get instant, contextual answers. It's like having a personal tutor who has read and understood every page, ready to explain concepts and clarify confusion.",
    color: "from-blue-500 to-indigo-400",
    glow: "rgba(59, 130, 246, 0.3)",
  },
  {
    icon: <Zap className="h-6 w-6" />,
    title: "Lightning-Fast Generation",
    desc: "Get complete study materials in under a minute. No waiting, no manual work—just upload your document and watch as AI instantly creates everything you need to excel.",
    color: "from-amber-500 to-orange-400",
    glow: "rgba(245, 158, 11, 0.3)",
  },
  {
    icon: <Sparkles className="h-6 w-6" />,
    title: "Interactive Flashcards",
    desc: "Master concepts with intelligent flashcard generation and spaced repetition. Swipe through cards with Tinder-style animations, track your progress, and focus on areas that need improvement.",
    color: "from-purple-500 to-pink-400",
    glow: "rgba(168, 85, 247, 0.3)",
  },
  {
    icon: <Search className="h-6 w-6" />,
    title: "Smart Document Chat",
    desc: "Ask questions about your documents and get instant, intelligent answers. Powered by Google Gemini's 250K token context window for deep understanding.",
    color: "from-emerald-500 to-teal-400",
    glow: "rgba(16, 185, 129, 0.3)",
  },
  {
    icon: <FileText className="h-6 w-6" />,
    title: "Export Anywhere",
    desc: "Take your learning offline with professional PDF and DOCX exports. Beautifully formatted study materials you can print, share, or access anywhere.",
    color: "from-rose-500 to-red-400",
    glow: "rgba(244, 63, 94, 0.3)",
  },
] as const

function FeatureCard({ feature, index }: { feature: typeof FEATURES[number]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="group relative h-full"
    >
      <div className="relative h-full overflow-hidden rounded-2xl border border-border/50 bg-white/95 dark:bg-card/80 p-6 backdrop-blur-sm transition-all duration-300 hover:border-primary/50 shadow-lg hover:shadow-xl hover:scale-105">
        {/* Icon */}
        <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} text-white shadow-lg`}>
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
    <section id="features" className="relative py-10 sm:py-16 overflow-hidden w-full">
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
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">Powered by AI</span>
          </div>

          <h2 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Everything You Need to{" "}
            <span className="bg-gradient-to-r from-primary via-amber-500 to-primary bg-clip-text text-transparent animate-gradient" style={{ backgroundSize: "200% auto" }}>
              Master Anything
            </span>
          </h2>

          <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
            Powerful tools that transform dense documents into deep understanding. Study smarter, not harder.
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

