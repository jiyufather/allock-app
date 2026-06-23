// 락스터디 관리 공용 상수 — 요일/시간슬롯/활동유형 색상

export const LOCK_STUDY_DAYS = ['월', '화', '수', '목', '금', '토', '일']

// 09:00 ~ 22:00, 30분 단위 (26 슬롯)
export const LOCK_STUDY_SLOTS = Array.from({ length: 26 }, (_, i) => {
  const totalMin = 9 * 60 + i * 30
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

export const LOCK_STUDY_ACTIVITIES = ['입실', '퇴실', '외출', '복귀', '점심시간', '저녁시간', '멘토링', '수업', '기타'] as const

// 직접 텍스트 입력이 가능한 활동 (수업명/학원명 등)
export const LOCK_CUSTOM_ACTIVITIES = ['수업', '기타']

export const LOCK_ACT_COLORS: Record<string, string> = {
  입실: '#86EFAC',
  퇴실: '#FCA5A5',
  외출: '#FDBA74',
  복귀: '#FDE68A',
  점심시간: '#D4D4D8',
  저녁시간: '#A8A29E',
  멘토링: '#67E8F9',
  수업: '#F0ABFC',
  기타: '#E5E7EB',
}

/** 셀 값에 맞는 색상 반환. 수업/기타 직접입력 텍스트는 해당 카테고리 색상으로 대체 */
export function lockColorFor(value: string): string {
  if (!value) return ''
  if (LOCK_ACT_COLORS[value]) return LOCK_ACT_COLORS[value]
  return LOCK_ACT_COLORS['기타']
}

export function emptyLockEntries(): Record<string, string[]> {
  return {}
}
