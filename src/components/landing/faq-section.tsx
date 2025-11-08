"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Plus, Minus, HelpCircle } from "lucide-react"
import { useState } from "react"
import { SectionBackground } from "./backgrounds"
import { cn } from "@/lib/utils"

/**
 * FAQ Section - Modern Accordion with Smooth Animations
 *
 * Features custom accordion implementation with:
 * - Smooth expand/collapse animations
 * - Rotating icons (plus/minus)
 * - Gradient highlights on active items
 * - Staggered reveal animations
 */

const FAQ_ITEMS = [
  {
    question: "What makes this different from other study tools?",
    answer:
      "CogniLeap uses production-grade AI with Google Gemini models' 250K token context window. Unlike basic note-taking apps, we build complete knowledge structures from your documents, enabling deep understanding rather than surface-level summaries. The system understands context, relationships, and can answer complex questions about your materials.",
  },
  {
    question: "How does the AI processing work?",
    answer:
      "We use a sophisticated multi-stage pipeline: (1) PDF parsing with complete text extraction, (2) AI analysis with Google Gemini for concept identification and relationship mapping, (3) Intelligent content generation tailored to your learning style. All processing happens in under 60 seconds using Gemini's advanced language understanding.",
  },
  {
    question: "What document formats are supported?",
    answer:
      "Currently optimized for PDF documents including research papers, textbooks, lecture slides, and technical documentation. Our advanced text extraction handles complex layouts, text-based tables, and structured content while preserving document hierarchy and contextual relationships.",
  },
  {
    question: "Can I export the generated study materials?",
    answer:
      "Yes! All generated content (summaries, notes, study guides, and flashcards) can be exported to professionally formatted PDF or DOCX files. Exports maintain proper formatting, include all visual elements, and are ready for printing or sharing. Generated materials are cached locally for quick access.",
  },
  {
    question: "Is my data secure and private?",
    answer:
      "Absolutely. All documents are stored in private Supabase storage with Row Level Security (RLS) enabled. Your data is isolated per user, processing happens on secure servers, and we never share or train models on your content. All AI processing uses Google's secure infrastructure with enterprise-grade security.",
  },
  {
    question: "What are the technical requirements?",
    answer:
      "CogniLeap runs in any modern web browser (Chrome, Firefox, Safari, Edge). For optimal performance, we recommend 4GB+ RAM and a stable internet connection during document upload and AI processing. Once materials are generated, they're cached locally for offline access and fast retrieval.",
  },
]

function FAQAccordionItem({
  item,
  index,
  isOpen,
  onToggle,
}: {
  item: typeof FAQ_ITEMS[number]
  index: number
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08 }}
      className={cn(
        "group relative overflow-hidden rounded-xl border transition-all duration-300",
        "bg-white/95 shadow-[0_24px_48px_rgba(15,23,42,0.08)] border-white/70",
        "dark:bg-[rgba(15,23,42,0.82)] dark:border-white/10 dark:shadow-[0_22px_48px_rgba(2,6,23,0.55)]",
        isOpen ? "ring-1 ring-teal-400/30" : "hover:border-white/85"
      )}
      style={{
        borderColor: isOpen ? "rgba(20, 184, 166, 0.55)" : undefined,
        backgroundColor: isOpen ? "rgba(20, 184, 166, 0.1)" : undefined,
        boxShadow: isOpen ? "0 18px 48px rgba(20, 184, 166, 0.18)" : undefined,
      }}
    >
      {/* Question button */}
      <button
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-3 text-left transition-colors",
          isOpen ? "px-4 pt-4 pb-0" : "p-4"
        )}
      >
        {/* Icon */}
        <motion.div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-teal-400 text-white shadow-lg"
          animate={{
            rotate: isOpen ? 180 : 0,
            scale: isOpen ? 1.05 : 1,
          }}
          transition={{ duration: 0.3, type: "spring", stiffness: 200 }}
        >
          {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </motion.div>

        {/* Question text */}
        <div className="flex-1">
          <h3
            className={`font-semibold transition-colors ${
              isOpen ? "text-primary" : "text-foreground group-hover:text-primary"
            }`}
          >
            {item.question}
          </h3>
        </div>
      </button>

      {/* Answer with smooth height animation */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.3, ease: "easeInOut" },
              opacity: { duration: 0.2, ease: "easeInOut" },
            }}
            className="overflow-hidden"
          >
            <motion.div
              initial={{ y: -10 }}
              animate={{ y: 0 }}
              exit={{ y: -10 }}
              transition={{ duration: 0.2 }}
              className="px-4 pt-2 pb-4 pl-[3.75rem]"
            >
              <p className="text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated gradient border */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300"
        style={{
          background: "linear-gradient(135deg, rgba(20, 184, 166, 0.3), transparent, rgba(20, 184, 166, 0.3))",
          backgroundSize: "200% 200%",
        }}
        animate={{
          backgroundPosition: isOpen ? ["0% 0%", "100% 100%"] : "0% 0%",
          opacity: isOpen ? 0.5 : 0,
        }}
        transition={{
          backgroundPosition: { duration: 2, repeat: Infinity, ease: "linear" },
          opacity: { duration: 0.3 },
        }}
      />
    </motion.div>
  )
}

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section id="faq" className="relative overflow-hidden py-10 sm:py-16" suppressHydrationWarning>
      <SectionBackground />

      <div className="relative mx-auto max-w-7xl px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-4xl text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm backdrop-blur-sm shadow-sm dark:shadow-none"
          >
            <HelpCircle className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">Common Questions</span>
          </div>

          <h2 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Everything You{" "}
            <span className="bg-gradient-to-r from-primary via-amber-500 to-primary bg-clip-text text-transparent animate-gradient" style={{ backgroundSize: "200% auto" }}>
              Need to Know
            </span>
          </h2>

          <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
            Technical details, features, and answers to help you understand the full capabilities of CogniLeap’s AI
            learning system.
          </p>
        </motion.div>

        {/* FAQ Accordion */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="space-y-4">
            {FAQ_ITEMS.map((item, index) => (
              <FAQAccordionItem
                key={index}
                item={item}
                index={index}
                isOpen={openIndex === index}
                onToggle={() => handleToggle(index)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
