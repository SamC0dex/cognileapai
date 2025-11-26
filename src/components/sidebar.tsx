'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Settings,
  FileText,
  MoreHorizontal,
  User,
  Sun,
  Moon,
  Palette,
  LogOut
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import {
  Button,
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Separator
} from '@/components/ui'
import { ClientOnly } from '@/components/client-only'
import { Logo } from './logo'
import { ChatDuotoneIcon } from '@/components/icons/chat-duotone'
import { useUser } from '@/hooks/use-user'
import { logOutAndClear } from '@/lib/auth-utils'

interface SidebarProps {
  isCollapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  isDocumentsPanelOpen?: boolean
  onDocumentsPanelToggle?: () => void
}

export function Sidebar({ isCollapsed = false, onCollapsedChange, isDocumentsPanelOpen = false, onDocumentsPanelToggle }: SidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { user, profile, loading } = useUser()
  const [loggingOut, setLoggingOut] = React.useState(false)

  const handleToggle = () => {
    const newState = !isCollapsed
    onCollapsedChange?.(newState)
  }

  const handleLogOut = async () => {
    try {
      setLoggingOut(true)
      await logOutAndClear('/auth/login')
    } catch (error) {
      console.error('Log out error:', error)
    } finally {
      setLoggingOut(false)
    }
  }

  const toggleTheme = () => {
    const root = document.documentElement
    const next = theme === 'dark' ? 'light' : 'dark'
    root.classList.add('theme-instant')

    const bg = getComputedStyle(root).getPropertyValue('--background').trim()
    const overlay = document.createElement('div')
    overlay.className = 'theme-switch-overlay'
    overlay.style.background = `hsl(${bg})`
    document.body.appendChild(overlay)

    requestAnimationFrame(() => {
      overlay.style.opacity = '1'
      window.setTimeout(() => {
        setTheme(next)
        requestAnimationFrame(() => {
          overlay.style.opacity = '0'
          window.setTimeout(() => {
            overlay.remove()
            root.classList.remove('theme-instant')
          }, 55)
        })
      }, 25)
    })
  }

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      current: pathname === '/dashboard'
    },
    {
      name: 'Chat',
      href: '/chat',
      icon: ChatDuotoneIcon,
      current: pathname?.startsWith('/chat') || false
    },
    {
      name: 'My Courses',
      href: '/courses',
      icon: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      current: pathname?.startsWith('/courses') || false
    },
    {
      name: 'Documents',
      href: '/documents',
      icon: FileText,
      current: isDocumentsPanelOpen,
      isPanel: true
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Settings,
      current: pathname === '/settings'
    }
  ]

  return (
    <motion.div
      className={cn(
        "relative z-[200] flex flex-col h-screen app-sidebar pointer-events-auto",
        isCollapsed ? "w-16" : "w-64"
      )}
      initial={false}
      animate={{ width: isCollapsed ? 64 : 256 }}
      transition={{
        duration: 0.18,
        ease: [0.4, 0, 0.2, 1],
        type: "tween"
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {!isCollapsed ? (
          <div className="flex items-center gap-2">
            <Logo width={36} height={36} />
            <span className="text-lg font-semibold text-sidebar-foreground">
              CogniLeap
            </span>
          </div>
        ) : (
          <div className="flex justify-center">
            <Logo width={32} height={32} />
          </div>
        )}
        
        {/* Show theme toggle only when not collapsed, otherwise show collapse toggle */}
        {!isCollapsed ? (
          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-8 w-8 hover:bg-sidebar-accent transition-colors duration-150"
              suppressHydrationWarning
            >
              <ClientOnly fallback={<Palette className="h-4 w-4" />}>
                <span suppressHydrationWarning>
                  {theme === 'dark' ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </span>
              </ClientOnly>
            </Button>
            
            {/* Collapse Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggle}
              className="h-8 w-8 hover:bg-sidebar-accent transition-colors duration-150"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      {/* Collapse toggle for collapsed state */}
      {isCollapsed && (
        <div className="flex justify-center py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggle}
            className="h-8 w-8 hover:bg-sidebar-accent transition-colors duration-150"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Workspace Selector removed per request */}

      {/*
        ====================================
        🚧 FUTURE FEATURE: New Course/Lesson Creation
        ====================================

        TEMPORARILY HIDDEN - DO NOT REMOVE FROM CODEBASE

        This "New Course" dropdown button is part of the planned course/lesson
        creation feature that will be implemented in a future release.

        Features to be implemented:
        - Course creation and management system
        - Lesson creation within courses
        - Structured learning paths
        - Course content organization

        Once the course creation backend and UI are ready, uncomment this
        entire section to restore the functionality.

        Related files that will need updates:
        - Course creation pages/components
        - Course management API endpoints
        - Database schema for courses/lessons

        Last hidden: Dashboard navigation refactor
        Reason: Course creation feature not yet implemented

        ====================================
      */}

      {/*
      Primary Action Button - New Course/Lesson Creation
      <div className="px-4 py-2">
        {!isCollapsed ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="purple"
                className="w-full gap-2 button-primary dark:from-teal-600 dark:to-teal-700 dark:hover:from-teal-700 dark:hover:to-teal-800"
              >
                <Plus className="h-4 w-4" />
                New Course
                <ChevronDown className="h-4 w-4 ml-auto" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 app-dropdown">
              <DropdownMenuItem
                onClick={() => {
                  console.log('New Course clicked - direct navigation');
                  window.location.href = '/chat?type=course&title=New%20Course';
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Course
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  console.log('New Lesson clicked - direct navigation');
                  window.location.href = '/chat?type=lesson&title=New%20Lesson';
                }}
              >
                <Lightbulb className="h-4 w-4 mr-2" />
                New Lesson
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex justify-center">
            <Button variant="purple" size="icon" className="w-10 h-10 dark:from-teal-600 dark:to-teal-700 dark:hover:from-teal-700 dark:hover:to-teal-800">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
      */}


      {/* Navigation */}
      <nav className="flex-1 px-4 py-2 space-y-2">
        {navigation.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.name}
              onClick={() => {
                if (item.isPanel) {
                  onDocumentsPanelToggle?.();
                } else {
                  console.log(`Direct navigation to ${item.href}`);
                  window.location.href = item.href;
                }
              }}
              className={cn(
                "nav-item group w-full",
                item.current && "active",
                isCollapsed && "justify-center"
              )}
              type="button"
            >
              <Icon
                className={cn(
                  "shrink-0",
                  isCollapsed ? "h-5 w-5" : "h-5 w-5"
                )}
              />
              {!isCollapsed && (
                <div className="flex items-center justify-between w-full">
                  <span className="truncate">{item.name}</span>
                </div>
              )}
            </button>
          )
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-sidebar-border">
        {loading ? (
          // Loading skeleton
          <div className="animate-pulse">
            {!isCollapsed ? (
              <div className="flex items-center gap-3 p-3">
                <div className="h-8 w-8 rounded-full bg-sidebar-accent" />
                <div className="flex-1">
                  <div className="h-4 w-20 bg-sidebar-accent rounded mb-1" />
                  <div className="h-3 w-32 bg-sidebar-accent rounded" />
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="h-10 w-10 rounded-full bg-sidebar-accent" />
              </div>
            )}
          </div>
        ) : !isCollapsed ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start h-auto p-3 hover:bg-sidebar-accent"
              >
                <Avatar className="h-8 w-8 mr-3">
                  <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-medium">
                    {profile?.full_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left flex-1">
                  <div className="text-sm font-medium text-sidebar-foreground truncate">
                    {profile?.full_name || user?.email?.split('@')[0] || 'User'}
                  </div>
                  <div className="text-xs text-sidebar-foreground/60 truncate">
                    {user?.email || 'No email'}
                  </div>
                </div>
                <MoreHorizontal className="h-4 w-4 text-sidebar-foreground/60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 app-dropdown">
              <DropdownMenuItem>
                <User className="h-4 w-4 mr-2" />
                Profile Settings
              </DropdownMenuItem>
              <Separator />
              <DropdownMenuItem
                className="text-red-600"
                onClick={handleLogOut}
                disabled={loggingOut}
              >
                <LogOut className="h-4 w-4 mr-2" />
                {loggingOut ? 'Logging out...' : 'Log Out'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex justify-center">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-medium">
                {profile?.full_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
        )}
      </div>
    </motion.div>
  )
}
