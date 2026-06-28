"use client"

import Link from "next/link"
import { Sparkles } from "lucide-react"

const FOOTER_LINKS = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How It Works", href: "#how-it-works" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "Sign Up Free", href: "/auth/sign-up" },
      { label: "Sign In", href: "/auth/login" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
]

export default function LandingFooter() {
  return (
    <footer className="border-t bg-white/60 dark:bg-card/40 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 sm:py-12">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between sm:gap-16">
          {/* Brand */}
          <div className="flex-shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-teal-400 shadow-md">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-semibold">CogniLeap</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-[220px] leading-relaxed">
              AI-powered learning from upload to mastery. 100% free.
            </p>
          </div>

          {/* Links */}
          <div className="flex gap-10 sm:gap-16">
            {FOOTER_LINKS.map((group) => (
              <div key={group.heading}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {group.heading}
                </p>
                <ul className="space-y-2">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      {link.href.startsWith("#") ? (
                        <a
                          href={link.href}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/60">
          <p>© {new Date().getFullYear()} CogniLeap. All rights reserved.</p>
          <p>Bring your own AI key — Gemini, OpenRouter &amp; more</p>
        </div>
      </div>
    </footer>
  )
}
