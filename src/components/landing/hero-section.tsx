"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { buttonVariants } from "@/components/ui"
import { Sparkles, Rocket, ArrowRight } from "lucide-react"
import { AnimatedBackground } from "./backgrounds"

export default function HeroSection() {
  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <section className="relative min-h-[90vh] overflow-hidden flex items-center w-full">
      {/* Simple gradient background */}
      <AnimatedBackground />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-10 sm:py-14 w-full">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 flex justify-center w-full"
          >
            <div className="inline-flex items-center justify-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs md:text-sm backdrop-blur-sm shadow-sm dark:shadow-none">
              <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-transparent font-medium whitespace-nowrap">
                Powered by Google Gemini AI • Next-Gen Learning
              </span>
            </div>
          </motion.div>

          {/* Main headline - simple fade-in */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl mb-6"
          >
            Learn Anything,{" "}
            <span className="bg-gradient-to-r from-primary via-amber-500 to-primary bg-clip-text text-transparent">
              Remember Everything
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl md:text-2xl leading-relaxed"
          >
            Transform any document into your{" "}
            <span className="font-semibold text-foreground">personal learning companion</span>.
            AI-powered tools that don&apos;t just help you study—they help you{" "}
            <span className="font-semibold text-foreground">master anything</span>.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/auth/sign-up"
              className={buttonVariants({ size: "lg", variant: "default" }) + " text-base px-8 py-6 shadow-lg group"}
            >
              <span className="flex items-center gap-2 font-semibold">
                Start Learning Free
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            <Link
              href="#how-it-works"
              onClick={(e) => scrollToSection(e, 'how-it-works')}
              className={buttonVariants({ size: "lg", variant: "outline" }) + " text-base px-8 py-6 group shadow-md dark:shadow-none"}
            >
              <span className="flex items-center gap-2">
                <Rocket className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                See How It Works
              </span>
            </Link>
          </motion.div>

          {/* Study Tools Showcase */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-12 sm:mt-16 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto px-2"
          >
            {[
              { icon: "📝", label: "Smart Summary", color: "from-blue-500 to-cyan-400" },
              { icon: "📚", label: "Study Guide", color: "from-purple-500 to-pink-400" },
              { icon: "✍️", label: "Smart Notes", color: "from-amber-500 to-orange-400" },
              { icon: "🎯", label: "Flashcards", color: "from-teal-500 to-emerald-400" },
            ].map((feature, index) => (
              <div
                key={index}
                className="group relative hover:scale-105 transition-transform duration-200"
              >
                <div className="relative flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 rounded-xl sm:rounded-2xl border border-border/50 bg-white/90 dark:bg-card/60 px-3 sm:px-6 py-3 sm:py-4 backdrop-blur-sm hover:border-primary/50 hover:bg-white dark:hover:bg-card/80 transition-all shadow-md hover:shadow-lg">
                  <div className={`flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br ${feature.color} text-white shadow-lg flex-shrink-0 text-xl sm:text-2xl`}>
                    {feature.icon}
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-center sm:text-left">{feature.label}</span>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
