// 시간대별 감점 계산 헬퍼
import { Subject, Deduction } from '@/types'

export const DEDUCTION_REASONS = ['졸음', '딴짓', '자리비움', '기타'] as const

/** 시간 슬롯 배치 + 감점 내역 → 과목별 순공 인정 시간(분) */
export function computeNetSubjects(
  scheduleSlots: Partial<Record<string, Subject>> | undefined,
  deductions: Deduction[] | undefined,
): Partial<Record<Subject, number>> {
  const result: Partial<Record<Subject, number>> = {}
  if (!scheduleSlots) return result
  for (const sub of Object.values(scheduleSlots)) {
    if (!sub) continue
    result[sub] = (result[sub] ?? 0) + 30
  }
  for (const d of deductions ?? []) {
    const sub = scheduleSlots[d.slot]
    if (!sub) continue
    result[sub] = Math.max(0, (result[sub] ?? 0) - d.minutes)
  }
  return result
}

/** 배치된 슬롯들의 최소~최대 구간을 30분 단위로 채운 시간 목록 */
export function slotRange(scheduleSlots: Partial<Record<string, Subject>> | undefined): string[] {
  const keys = Object.keys(scheduleSlots ?? {}).sort()
  if (keys.length === 0) return []
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const start = toMin(keys[0])
  const end = toMin(keys[keys.length - 1])
  const out: string[] = []
  for (let t = start; t <= end; t += 30) {
    const h = Math.floor(t / 60)
    const m = t % 60
    out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return out
}
