'use client'

import { 
  ArrowLeft, 
  MoreHorizontal,
  Edit3,
  Trash2,
  BookOpen,
  Clock,
  Award
} from 'lucide-react'
import { 
  Button, 
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui'
import { cn } from '@/lib/utils'

interface CourseHeaderProps {
  title: string
  description?: string
  difficulty: string
  totalUnits: number
  totalLessons: number
  estimatedHours: number
  onBack: () => void
  onRename?: () => void
  onDelete?: () => void
}

export function CourseHeader({
  title,
  description,
  difficulty,
  totalUnits,
  totalLessons,
  estimatedHours,
  onBack,
  onRename,
  onDelete,
}: CourseHeaderProps) {
  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'beginner':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
      case 'intermediate':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800'
      case 'advanced':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800'
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Top Row: Back + Actions */}
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All Courses
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {onRename && (
                <DropdownMenuItem onClick={onRename} className="cursor-pointer">
                  <Edit3 className="h-4 w-4 mr-2" />
                  Rename Course
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem 
                  onClick={onDelete}
                  className="cursor-pointer text-red-600 dark:text-red-400"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Course
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Course Title + Badge */}
        <div className="flex items-start gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-foreground truncate">
                {title}
              </h1>
              <Badge className={cn("capitalize border", getDifficultyColor(difficulty))}>
                {difficulty}
              </Badge>
            </div>
            {description && (
              <p className="text-muted-foreground text-sm line-clamp-2">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Course Stats */}
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BookOpen className="w-4 h-4 text-violet-500" />
            <span><strong className="text-foreground">{totalLessons}</strong> lessons</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4 text-violet-500" />
            <span><strong className="text-foreground">{estimatedHours}</strong> hours</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Award className="w-4 h-4 text-violet-500" />
            <span><strong className="text-foreground">{totalUnits}</strong> units</span>
          </div>
        </div>
      </div>
    </div>
  )
}
