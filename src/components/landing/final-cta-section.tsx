"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { buttonVariants } from "@/components/ui"
import { ArrowRight } from "lucide-react"

export default function FinalCtaSection() {
  return (
    <section className="relative py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl rounded-3xl border border-border/50 bg-white/95 dark:bg-card/80 p-8 sm:p-12 text-center backdrop-blur-sm shadow-xl"
        >
          <h2 className="text-balance text-3xl font-bold sm:text-4xl md:text-5xl">
            Ready to{" "}
            <span className="bg-gradient-to-r from-primary via-amber-500 to-primary bg-clip-text text-transparent">
              Transform Your Learning?
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Join students and professionals who are mastering knowledge faster with AI-powered study tools.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
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
              href="/auth/login"
              className={buttonVariants({ size: "lg", variant: "outline" }) + " text-base px-8 py-6 shadow-md dark:shadow-none"}
            >
              Sign In
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
