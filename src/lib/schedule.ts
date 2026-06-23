// 주간 학습 시간표 공통 상수 — 요일/시간대/활동유형 색상 (goal, dashboard 페이지 공용)

export const SCHEDULE_DAYS = ['월', '화', '수', '목', '금', '토', '일']

// 05:00 ~ 23:00 (19 one-hour slots)
export const HOUR_SLOTS = Array.from({ length: 19 }, (_, i) => {
  const h = i + 5
  return `${String(h).padStart(2, '0')}:00`
})

export const ACTIVITIES = ['', '학교', '학원', '과외', '인강', '자습', '식사', '기타'] as const

// 학습시간 합계(배움+익힘)에 포함되는 활동 — 식사/기타(직접입력)는 제외
export const STUDY_ACTIVITIES = ['학교', '학원', '과외', '인강', '자습']

export const ACT_COLORS: Record<string, string> = {
  학교: '#BFDBFE', 학원: '#A7F3D0', 과외: '#FECACA', 인강: '#DDD6FE', 자습: '#FEF08A',
  식사: '#FDBA74', 기타: '#D4D4D8',
}

/** 셀 값에 맞는 색상 반환. 기타 직접입력 텍스트는 기타 색상으로 대체 */
export function colorForActivity(value: string): string {
  if (!value) return ''
  return ACT_COLORS[value] ?? ACT_COLORS['기타']
}

export function emptySchedule(): string[][] {
  return Array.from({ length: HOUR_SLOTS.length }, () => Array(7).fill(''))
}
