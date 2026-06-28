"use client"

import { createClient } from '@/lib/supabase/client'
import Dexie from 'dexie'

// Zustand stores (optional clearing)
// Note: dynamic imports avoid circular dependencies in Next.js
async function clearZustandStores() {
  try {
    const { useStudyToolsStore } = await import('@/lib/study-tools-store')
    const study = useStudyToolsStore.getState()
    study.clearGeneratedContent()
  } catch (e) {
    console.warn('[AuthUtils] Failed clearing StudyTools store:', e)
  }

  try {
    const { useFlashcardStore } = await import('@/lib/flashcard-store')
    const flash = useFlashcardStore.getState()
    flash.clearFlashcardSets()
  } catch (e) {
    console.warn('[AuthUtils] Failed clearing Flashcard store:', e)
  }

  try {
    const { cleanupChatStoreCaches } = await import('@/lib/chat-store')
    cleanupChatStoreCaches()
  } catch (e) {
    console.warn('[AuthUtils] Failed clearing Chat store caches:', e)
  }
}

export async function clearAllClientStorage() {
  try {
    // Remove only app-specific keys to avoid clearing Supabase auth tokens
    const keys = [
      'study-tools-storage',
      'flashcard-storage',
      'cognileap-quiz-store',
      'mindmap-storage',
      'cognileap:threads',
      'chat-storage',
      'cognileap-documents-cache-v1',
      'cognileap-uploading-documents-v1',
      'ar-agent-conversations',
      'ar-agent-active-convo',
      'ar-agent-chat-history'
    ]
    for (const key of keys) {
      try { localStorage.removeItem(key) } catch {}
      try { sessionStorage.removeItem(key) } catch {}
    }

    const removablePrefixes = [
      'cognileap-selected-documents-v1',
      'ar-agent-conversations:',
      'ar-agent-active-convo:'
    ]
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && removablePrefixes.some((prefix) => key.startsWith(prefix))) {
        try { localStorage.removeItem(key) } catch {}
      }
    }
  } catch (e) {
    console.warn('[AuthUtils] localStorage key removals failed:', e)
  }

  try {
    // Drop IndexedDB used by local chat cache
    await Dexie.delete('CogniLeapChatDB')
  } catch (e) {
    console.warn('[AuthUtils] Dexie delete failed:', e)
  }
}

export async function logOutAndClear(redirectTo = '/auth/login') {
  const supabase = createClient()

  // Best effort cleanup before signing out
  await clearZustandStores()
  await clearAllClientStorage()

  try {
    await supabase.auth.signOut()
  } catch (e) {
    console.warn('[AuthUtils] supabase.signOut failed:', e)
  }

  // Second pass cleanup just in case
  await clearZustandStores()
  await clearAllClientStorage()

  // Hard redirect to avoid any stale state
  if (typeof window !== 'undefined') {
    window.location.replace(redirectTo)
  }
}
