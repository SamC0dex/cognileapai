"use client"

import { cn } from "@/lib/utils"

export function AnimatedBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Light mode gradient */}
      <div
        className={cn("absolute inset-0 dark:hidden")}
        style={{
          background:
            "radial-gradient(ellipse at 20% 10%, rgba(139,92,246,0.10) 0%, transparent 55%)," +
            "radial-gradient(ellipse at 80% 20%, rgba(244,114,182,0.09) 0%, transparent 50%)," +
            "radial-gradient(ellipse at 50% 90%, rgba(20,184,166,0.11) 0%, transparent 55%)," +
            "linear-gradient(160deg, #f9f8ff 0%, #fdf8f3 50%, #f5fffe 100%)",
        }}
      />

      {/* Dark mode gradient */}
      <div className="absolute inset-0 hidden dark:block bg-gradient-to-br from-[#020817] via-[#041023] to-[#010b14]" />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background:
            "radial-gradient(ellipse at 20% 10%, rgba(139,92,246,0.07) 0%, transparent 50%)," +
            "radial-gradient(ellipse at 80% 25%, rgba(20,184,166,0.06) 0%, transparent 50%)",
        }}
      />

      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.025]"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
    </div>
  )
}

export function SectionBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute right-0 top-0 h-[400px] w-[400px] rounded-full opacity-[0.12] blur-[100px]"
        style={{
          background: "radial-gradient(circle, rgba(20,184,166,0.5) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute left-0 bottom-0 h-[300px] w-[300px] rounded-full opacity-[0.07] blur-[80px]"
        style={{
          background: "radial-gradient(circle, rgba(139,92,246,0.5) 0%, transparent 70%)",
        }}
      />
    </div>
  )
}
