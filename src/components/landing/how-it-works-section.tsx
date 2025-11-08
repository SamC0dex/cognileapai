"use client"

import { motion } from "framer-motion"
import { Upload, Brain, Sparkles, MessageSquare } from "lucide-react"
import { SectionBackground } from "./backgrounds"

/**
 * Simplified How It Works Section
 *
 * Clean, straightforward explanation of the process with simple animations
 */

const STEPS = [
  {
    number: "01",
    icon: <Upload className="h-6 w-6" />,
    title: "Upload Your Document",
    description: "Simply upload any PDF document. Our system instantly extracts and processes the content.",
    color: "from-blue-500 to-cyan-400",
  },
  {
    number: "02",
    icon: <Brain className="h-6 w-6" />,
    title: "AI Analysis",
    description: "Powered by Google Gemini, the AI analyzes your document to understand key concepts and structure.",
    color: "from-purple-500 to-pink-400",
  },
  {
    number: "03",
    icon: <Sparkles className="h-6 w-6" />,
    title: "Generate Study Materials",
    description: "In under 60 seconds, get comprehensive study guides, summaries, notes, and flashcards.",
    color: "from-amber-500 to-orange-400",
  },
  {
    number: "04",
    icon: <MessageSquare className="h-6 w-6" />,
    title: "Chat & Learn",
    description: "Ask questions about your document and get instant, intelligent answers with full context.",
    color: "from-teal-500 to-emerald-400",
  },
]

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative overflow-hidden py-10 sm:py-16 w-full">
      <SectionBackground />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm backdrop-blur-sm shadow-sm dark:shadow-none">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">Simple Process</span>
          </div>

          <h2 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            How{" "}
            <span className="bg-gradient-to-r from-primary via-amber-500 to-primary bg-clip-text text-transparent">
              It Works
            </span>
          </h2>

          <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
            From document to mastery in four simple steps. It&apos;s that easy.
          </p>
        </motion.div>

        {/* Steps Grid */}
        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative"
            >
              {/* Step Card */}
              <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-white/95 dark:bg-card/80 p-6 backdrop-blur-sm transition-all duration-300 hover:border-primary/50 shadow-lg hover:shadow-xl hover:scale-105">
                {/* Step Number */}
                <div className="mb-4 text-4xl font-bold text-muted-foreground/20">
                  {step.number}
                </div>

                {/* Icon */}
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${step.color} text-white shadow-lg`}>
                  {step.icon}
                </div>

                {/* Content */}
                <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>

              {/* Connection Arrow (except for last item) */}
              {index < STEPS.length - 1 && (
                <div className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 translate-x-1/2 lg:block">
                  <div className="h-0.5 w-8 bg-gradient-to-r from-primary/50 to-transparent" />
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-16 text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-6 py-3 text-sm font-medium backdrop-blur-sm shadow-md dark:shadow-none">
            <Brain className="h-4 w-4" />
            <span>
              Complete transformation in{" "}
              <span className="font-semibold text-primary">&lt; 60 seconds</span>
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
