"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { buttonVariants } from "@/components/ui"
import { ArrowRight, RotateCcw, Sparkles } from "lucide-react"

const PROOF_ITEMS = [
  { icon: "📚", text: "6 Study Tools" },
  { icon: "🔄", text: "Active Recall" },
  { icon: "🗺️", text: "Mind Maps" },
  { icon: "✅", text: "Always Free" },
]

export default function FinalCtaSection() {
  return (
    <section className="relative py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-border/50 bg-white/95 dark:bg-card/80 p-8 sm:p-14 text-center backdrop-blur-sm shadow-2xl"
        >
          {/* Subtle gradient accent */}
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl opacity-40"
            style={{
              background:
                "radial-gradient(ellipse at 50% -20%, rgba(20,184,166,0.18) 0%, transparent 70%)",
            }}
          />

          <div className="relative">
            {/* Icon badge */}
            <div className="mb-6 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-teal-400 text-white shadow-xl">
                <RotateCcw className="h-7 w-7" />
              </div>
            </div>

            <h2 className="text-balance text-3xl font-bold sm:text-4xl md:text-5xl">
              Ready to Study{" "}
              <span className="bg-gradient-to-r from-primary via-amber-500 to-primary bg-clip-text text-transparent">
                Like Never Before?
              </span>
            </h2>

            <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
              Upload your first document and have a complete study kit — including Active Recall — ready in under 60 seconds.
            </p>

            {/* Proof chips */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {PROOF_ITEMS.map((item, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-sm font-medium"
                >
                  <span>{item.icon}</span>
                  {item.text}
                </span>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/auth/sign-up"
                className={
                  buttonVariants({ size: "lg", variant: "default" }) +
                  " text-base px-8 py-6 shadow-lg group"
                }
              >
                <span className="flex items-center gap-2 font-semibold">
                  <Sparkles className="h-4 w-4" />
                  Start Learning Free
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>
              <Link
                href="/auth/login"
                className={
                  buttonVariants({ size: "lg", variant: "outline" }) +
                  " text-base px-8 py-6"
                }
              >
                Sign In
              </Link>
            </div>

          </div>
        </motion.div>
      </div>
    </section>
  )
}
