"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { buttonVariants } from "@/components/ui"
import { Sparkles, ArrowRight, RotateCcw } from "lucide-react"
import { AnimatedBackground } from "./backgrounds"

const TOOLS = [
  { icon: "📝", label: "Smart Summary", color: "from-blue-500 to-cyan-400" },
  { icon: "📚", label: "Study Guide", color: "from-purple-500 to-pink-400" },
  { icon: "✍️", label: "Smart Notes", color: "from-amber-500 to-orange-400" },
  { icon: "🎯", label: "Flashcards", color: "from-teal-500 to-emerald-400" },
  { icon: "🧠", label: "Quiz", color: "from-rose-500 to-red-400" },
  { icon: "🗺️", label: "Mind Map", color: "from-violet-500 to-indigo-400" },
]

export default function HeroSection() {
  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <section className="relative min-h-[92vh] overflow-hidden flex items-center w-full">
      <AnimatedBackground />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16 w-full">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 flex justify-center"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs md:text-sm backdrop-blur-sm shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-transparent font-medium">
                AI-Powered Learning Platform
              </span>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl mb-6"
          >
            Learn Anything,{" "}
            <span className="bg-gradient-to-r from-primary via-amber-500 to-primary bg-clip-text text-transparent">
              Remember Everything
            </span>
          </motion.h1>

          {/* Sub-headline */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl leading-relaxed"
          >
            Upload any PDF. Get{" "}
            <span className="font-semibold text-foreground">summaries, guides, flashcards, quizzes & mind maps</span>{" "}
            in seconds. Then lock in retention with{" "}
            <span className="font-semibold text-foreground">AI-powered active recall</span>.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/auth/sign-up"
              className={
                buttonVariants({ size: "lg", variant: "default" }) +
                " text-base px-8 py-6 shadow-lg group"
              }
            >
              <span className="flex items-center gap-2 font-semibold">
                Start Learning Free
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            <Link
              href="#how-it-works"
              onClick={(e) => scrollToSection(e, "how-it-works")}
              className={
                buttonVariants({ size: "lg", variant: "outline" }) +
                " text-base px-8 py-6 group shadow-sm dark:shadow-none"
              }
            >
              <span className="flex items-center gap-2">
                See How It Works
                <ArrowRight className="h-4 w-4 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
          </motion.div>

          {/* Study Tools Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-12 sm:mt-16 space-y-4"
          >
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
              6 AI Study Tools in One Platform
            </p>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 max-w-3xl mx-auto">
              {TOOLS.map((tool, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.45 + index * 0.06 }}
                  className="group relative hover:scale-105 transition-transform duration-200"
                >
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-border/50 bg-white/90 dark:bg-card/60 px-2 py-3 backdrop-blur-sm hover:border-primary/40 hover:bg-white dark:hover:bg-card/80 transition-all shadow-sm hover:shadow-md">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${tool.color} text-lg shadow-md flex-shrink-0`}
                    >
                      {tool.icon}
                    </div>
                    <span className="text-[10px] sm:text-xs font-medium text-center leading-tight">
                      {tool.label}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Active Recall badge */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.85 }}
              className="flex justify-center mt-2"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/8 px-5 py-2 text-sm font-medium text-teal-700 dark:text-teal-400 backdrop-blur-sm shadow-sm">
                <RotateCcw className="h-3.5 w-3.5" />
                + Active Recall with SM-2 Spaced Repetition
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
