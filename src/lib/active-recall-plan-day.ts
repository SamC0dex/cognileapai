type ScheduleDayLike = {
  day?: number
  date?: string
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfLocalDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function getCalendarPlanDay(
  schedule: ScheduleDayLike[],
  createdAt?: string | null,
  now = new Date(),
) {
  const days = Array.isArray(schedule) ? schedule : []
  const totalDays = days.length
  if (totalDays === 0) return 1

  const today = localDateKey(now)
  const exactDateMatch = days.find((day) => day.date === today && typeof day.day === 'number')
  if (exactDateMatch?.day) {
    return Math.min(totalDays, Math.max(1, exactDateMatch.day))
  }

  const datedDays = days
    .filter((day): day is Required<Pick<ScheduleDayLike, 'day' | 'date'>> =>
      typeof day.day === 'number' && typeof day.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.date)
    )
    .sort((a, b) => a.date.localeCompare(b.date))

  if (datedDays.length > 0) {
    if (today <= datedDays[0].date) return Math.min(totalDays, Math.max(1, datedDays[0].day))
    const latestStartedDay = datedDays.reduce((latest, day) =>
      day.date <= today && day.date >= latest.date ? day : latest
    , datedDays[0])
    return Math.min(totalDays, Math.max(1, latestStartedDay.day))
  }

  if (!createdAt) return 1

  const planCreated = startOfLocalDay(new Date(createdAt))
  const current = startOfLocalDay(now)
  const elapsedDays = Math.floor((current.getTime() - planCreated.getTime()) / (1000 * 60 * 60 * 24))
  return Math.min(totalDays, Math.max(1, elapsedDays + 1))
}
