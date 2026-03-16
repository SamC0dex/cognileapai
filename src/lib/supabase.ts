import { createClient } from '@supabase/supabase-js'

// Study tool payload types for the outputs table
export interface StudyToolMetadata {
  generatedAt: string
  model: string
  duration: number
  contentLength: number
  sourceContentLength: number
  fallbackStrategy?: string
  totalCards?: number
  avgDifficulty?: string
}

export interface StudyToolPayload {
  title: string
  content: string
  type: 'study-guide' | 'smart-summary' | 'smart-notes' | 'flashcards'
  documentId?: string
  conversationId?: string
  createdAt: string
  // Flashcard-specific data
  cards?: Array<{
    id: string
    question: string
    answer: string
    difficulty?: string
    topic?: string
  }>
  options?: {
    numberOfCards?: 'fewer' | 'standard' | 'more'
    difficulty?: 'easy' | 'medium' | 'hard'
    customInstructions?: string
  }
  metadata: StudyToolMetadata
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

export type Database = {
  public: {
    Tables: {
      documents: {
        Row: {
          id: string
          title: string
          page_count: number
          bytes: number
          storage_path: string | null
          checksum: string | null
          processing_status: string
          chunk_count: number
          error_message: string | null
          document_content: string | null
          actual_tokens: number | null
          token_count_method: string
          file_type: string
          created_at: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          id?: string
          title: string
          page_count?: number
          bytes?: number
          storage_path?: string | null
          checksum?: string | null
          processing_status?: string
          chunk_count?: number
          error_message?: string | null
          document_content?: string | null
          actual_tokens?: number | null
          token_count_method?: string
          file_type?: string
          created_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          id?: string
          title?: string
          page_count?: number
          bytes?: number
          storage_path?: string | null
          checksum?: string | null
          processing_status?: string
          chunk_count?: number
          error_message?: string | null
          document_content?: string | null
          actual_tokens?: number | null
          token_count_method?: string
          file_type?: string
          created_at?: string
          updated_at?: string
          user_id?: string | null
        }
      }
      sections: {
        Row: {
          id: string
          document_id: string
          ord: number
          title: string
          page_start: number
          page_end: number
          parent_id: string | null
          status: string
        }
        Insert: {
          id?: string
          document_id: string
          ord: number
          title: string
          page_start?: number
          page_end?: number
          parent_id?: string | null
          status?: string
        }
        Update: {
          id?: string
          document_id?: string
          ord?: number
          title?: string
          page_start?: number
          page_end?: number
          parent_id?: string | null
          status?: string
        }
      }
      outputs: {
        Row: {
          id: string
          document_id: string
          section_id: string | null
          overall: boolean
          type: 'summary' | 'notes' | 'study_guide'
          payload: StudyToolPayload
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          section_id?: string | null
          overall?: boolean
          type: 'summary' | 'notes' | 'study_guide'
          payload: StudyToolPayload
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          section_id?: string | null
          overall?: boolean
          type?: 'summary' | 'notes' | 'study_guide'
          payload?: StudyToolPayload
          created_at?: string
        }
      }
    }
  }
}
