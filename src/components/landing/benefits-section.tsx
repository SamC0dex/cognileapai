"use client"

import { motion } from "framer-motion"
import { Layers, Clock, Infinity } from "lucide-react"
import { SectionBackground } from "./backgrounds"

const BENEFITS = [
  {
    icon: <Clock className="h-6 w-6" />,
    metric: "60s",
    label: "To Full Study Kit",
    description: "Upload a PDF and get 6 complete study tools generated in under a minute",
    color: "from-amber-500 to-orange-400",
  },
  {
    icon: <Layers className="h-6 w-6" />,
    metric: "4",
    label: "Mastery Layers",
    description: "Science-backed SM-2 spaced repetition guides you from Absorb to Mastered",
    color: "from-teal-500 to-emerald-400",
  },
  {
    icon: <Infinity className="h-6 w-6" />,
    metric: "Free",
    label: "Always & Forever",
    description: "Full access to every AI-powered feature — no paywall, no hidden cost",
    color: "from-purple-500 to-pink-400",
  },
]

export default function BenefitsSection() {
  return (
    <section className="relative overflow-hidden py-16 sm:py-24">
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
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">Why CogniLeap</span>
          </div>

          <h2 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Study Smarter,{" "}
            <span className="bg-gradient-to-r from-primary via-amber-500 to-primary bg-clip-text text-transparent">
              Retain Longer
            </span>
          </h2>

          <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
            Speed is good. Retention is better. CogniLeap gives you both.
          </p>
        </motion.div>

        {/* Benefits Grid */}
        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
          {BENEFITS.map((benefit, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative"
            >
              <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-white/95 dark:bg-card/80 p-8 text-center backdrop-blur-sm transition-all duration-300 hover:border-primary/40 shadow-lg hover:shadow-xl hover:scale-[1.02]">
                <div
                  className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${benefit.color} text-white shadow-lg`}
                >
                  {benefit.icon}
                </div>

                <div className="mb-1 bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-5xl font-bold text-transparent">
                  {benefit.metric}
                </div>

                <h3 className="mb-2 text-lg font-semibold">{benefit.label}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{benefit.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
