// 올락 썸머스쿨 기간 및 공통 설정
export const SUMMER_START = process.env.NEXT_PUBLIC_SUMMER_START ?? '2026-05-22'
export const TOTAL_WEEKS = 4

type SummerProfile = { summerStart?: string; summerEnd?: string }

/** 학생 프로필 기준 실제 시작/종료일 반환 (미설정 시 전역 기본값) */
export function getEffectiveSummerDates(profile?: SummerProfile): { start: string; end: string } {
  const start = profile?.summerStart ?? SUMMER_START
  if (profile?.summerEnd) return { start, end: profile.summerEnd }
  const end = new Date(start)
  end.setDate(end.getDate() + TOTAL_WEEKS * 7)
  return { start, end: toDateStr(end) }
}

export function getWeekFromDate(dateStr: string, profile?: SummerProfile): number {
  const { start } = getEffectiveSummerDates(profile)
  const date = new Date(dateStr)
  const diffDays = Math.floor((date.getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 0
  return Math.min(Math.floor(diffDays / 7) + 1, TOTAL_WEEKS)
}

export function isWithinSummerSchool(dateStr: string, profile?: SummerProfile): boolean {
  const { start, end } = getEffectiveSummerDates(profile)
  const date = new Date(dateStr)
  return date >= new Date(start) && date < new Date(end)
}

export function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}분`
  if (m === 0) return `${h}시간`
  return `${h}시간 ${m}분`
}
