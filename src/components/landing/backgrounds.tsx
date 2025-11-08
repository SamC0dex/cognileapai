"use client"

import { cn } from "@/lib/utils"

/**
 * Static Gradient Background Component
 *
 * Clean gradient background for hero section (no animations)
 */

export function AnimatedBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Base gradient layer */}
      <div className="absolute inset-0">
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-br from-white via-[#f4f1ff]/90 to-[#fff7ef]/90",
            "dark:hidden"
          )}
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, rgba(139, 92, 246, 0.12), transparent 50%)," +
              "radial-gradient(circle at 85% 30%, rgba(244, 114, 182, 0.10), transparent 50%)," +
              "radial-gradient(circle at 50% 85%, rgba(20, 184, 166, 0.12), transparent 50%)",
          }}
        />
        <div className="absolute inset-0 hidden bg-gradient-to-br from-[#020817] via-[#041023] to-[#010409] dark:block" />
      </div>

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.05] dark:opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, currentColor 1px, transparent 1px),
            linear-gradient(to bottom, currentColor 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />
    </div>
  )
}

/**
 * Static gradient background for content sections (lighter version)
 */
export function SectionBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-40">
      {/* Subtle gradient */}
      <div
        className="absolute right-0 top-0 h-[300px] w-[300px] rounded-full opacity-20 blur-[80px]"
        style={{
          background: "radial-gradient(circle, rgba(20, 184, 166, 0.15) 0%, transparent 70%)",
        }}
      />
    </div>
  )
}
