"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Plus, Minus, HelpCircle } from "lucide-react"
import { useState } from "react"
import { SectionBackground } from "./backgrounds"
import { cn } from "@/lib/utils"

const FAQ_ITEMS = [
  {
    question: "What study tools does CogniLeap generate?",
    answer:
      "From a single PDF, CogniLeap generates six complete study tools: Smart Summary (key takeaways at a glance), Study Guide (structured deep-dive), Smart Notes (organized reference), Flashcards (Q&A pairs), Quiz (test your knowledge), and Mind Map (visual concept graph). All six are ready in under 60 seconds.",
  },
  {
    question: "What is Active Recall and how does it work?",
    answer:
      "Active Recall is CogniLeap's science-backed review system. It uses the SM-2 spaced repetition algorithm to schedule reviews at the optimal moment — right before you'd forget. Cards progress through 4 mastery layers: Absorb (first exposure) → Recognize (recognition-level recall) → Retrieve (active retrieval from memory) → Mastered (long-term retention confirmed). You can sync flashcards, quiz questions, and even mind map nodes into your review queue.",
  },
  {
    question: "How does the AI processing work?",
    answer:
      "CogniLeap routes requests through your configured AI provider — Gemini, OpenRouter, LaoZhang, or Kie.ai. The AI reads your entire document at once (up to 250K tokens with Gemini models) rather than in fragments, enabling deep understanding of structure, relationships, and context — not just keyword extraction. You control which model and provider powers your learning.",
  },
  {
    question: "What document formats are supported?",
    answer:
      "CogniLeap is optimized for PDF documents: research papers, textbooks, lecture slides, technical documentation, and more. Our text extraction handles complex layouts including multi-column formats, embedded tables, and document hierarchy.",
  },
  {
    question: "Can I export the generated study materials?",
    answer:
      "Yes — all generated content (summaries, notes, study guides, and flashcards) can be exported to professionally formatted PDF or DOCX files. Exports are print-ready and include all structured content. Materials are also cached locally so you can access them instantly without regenerating.",
  },
  {
    question: "Is my data secure and private?",
    answer:
      "Your documents are stored in private Supabase storage with Row Level Security enabled — your data is completely isolated from other users. We never use your content to train AI models. All AI processing runs through Google's secure infrastructure, and user API keys are encrypted at rest.",
  },
]

function FAQAccordionItem({
  item,
  index,
  isOpen,
  onToggle,
}: {
  item: (typeof FAQ_ITEMS)[number]
  index: number
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.07 }}
      className={cn(
        "group relative overflow-hidden rounded-xl border transition-all duration-300",
        "bg-white/95 shadow-md border-border/50",
        "dark:bg-card/80 dark:border-border/30",
        isOpen
          ? "border-teal-400/50 bg-teal-500/3 dark:bg-teal-500/5 shadow-lg"
          : "hover:border-border hover:shadow-lg"
      )}
    >
      <button
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-4 text-left transition-colors p-5",
          isOpen ? "pb-2" : "pb-5"
        )}
      >
        <motion.div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-teal-400 text-white shadow-md"
          animate={{ scale: isOpen ? 1.05 : 1 }}
          transition={{ duration: 0.2 }}
        >
          {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </motion.div>

        <h3
          className={`flex-1 font-semibold text-base transition-colors ${
            isOpen ? "text-teal-600 dark:text-teal-400" : "text-foreground group-hover:text-primary"
          }`}
        >
          {item.question}
        </h3>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.28, ease: "easeInOut" },
              opacity: { duration: 0.2 },
            }}
            className="overflow-hidden"
          >
            <div className="px-5 pt-1 pb-5 pl-[4.25rem]">
              <p className="text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="faq" className="relative overflow-hidden py-16 sm:py-24" suppressHydrationWarning>
      <SectionBackground />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-4xl text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm backdrop-blur-sm shadow-sm">
            <HelpCircle className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">Common Questions</span>
          </div>

          <h2 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Everything You{" "}
            <span className="bg-gradient-to-r from-primary via-amber-500 to-primary bg-clip-text text-transparent">
              Need to Know
            </span>
          </h2>

          <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
            How the platform works, what&apos;s included, and what makes it different.
          </p>
        </motion.div>

        <div className="mx-auto mt-16 max-w-4xl space-y-3">
          {FAQ_ITEMS.map((item, index) => (
            <FAQAccordionItem
              key={index}
              item={item}
              index={index}
              isOpen={openIndex === index}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
