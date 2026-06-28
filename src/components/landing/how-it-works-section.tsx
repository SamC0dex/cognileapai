"use client"

import { motion } from "framer-motion"
import { Upload, Sparkles, RotateCcw, GraduationCap } from "lucide-react"
import { SectionBackground } from "./backgrounds"

const STEPS = [
  {
    number: "01",
    icon: <Upload className="h-6 w-6" />,
    title: "Upload Your Document",
    description: "Drop in any PDF — textbook, research paper, lecture slides, or notes. Our system instantly extracts and processes all content.",
    color: "from-blue-500 to-cyan-400",
  },
  {
    number: "02",
    icon: <Sparkles className="h-6 w-6" />,
    title: "Generate Study Materials",
    description: "In under 60 seconds, AI produces a full toolkit: summary, study guide, smart notes, flashcards, quiz, and mind map — using your configured provider.",
    color: "from-amber-500 to-orange-400",
  },
  {
    number: "03",
    icon: <RotateCcw className="h-6 w-6" />,
    title: "Activate Recall Sessions",
    description: "Sync your materials into the Active Recall system. The SM-2 algorithm schedules reviews and tracks your progress through 4 mastery layers.",
    color: "from-teal-500 to-emerald-400",
  },
  {
    number: "04",
    icon: <GraduationCap className="h-6 w-6" />,
    title: "Reach Mastery",
    description: "Move cards from Absorb → Recognize → Retrieve → Mastered. Ask the AI coach anything along the way. Knowledge that actually sticks.",
    color: "from-purple-500 to-pink-400",
  },
]

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative overflow-hidden py-16 sm:py-24 w-full">
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
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm backdrop-blur-sm shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">Simple Process</span>
          </div>

          <h2 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            From Document to{" "}
            <span className="bg-gradient-to-r from-primary via-amber-500 to-primary bg-clip-text text-transparent">
              Mastered
            </span>
          </h2>

          <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
            A complete learning loop — from first contact with material to long-term retention.
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
              <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-white/95 dark:bg-card/80 p-6 backdrop-blur-sm transition-all duration-300 hover:border-primary/40 shadow-lg hover:shadow-xl hover:scale-[1.02]">
                <div className="mb-4 text-4xl font-bold text-muted-foreground/15 select-none">
                  {step.number}
                </div>
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${step.color} text-white shadow-lg`}
                >
                  {step.icon}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </div>

              {/* Connector arrow */}
              {index < STEPS.length - 1 && (
                <div className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 translate-x-1/2 lg:flex items-center">
                  <div className="h-px w-6 bg-gradient-to-r from-primary/40 to-transparent" />
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/30" />
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Bottom callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-14 text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/8 px-6 py-3 text-sm font-medium backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>
              Study materials ready in{" "}
              <span className="font-semibold text-primary">&lt; 60 seconds</span>
              {" "}— then review on your schedule
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
