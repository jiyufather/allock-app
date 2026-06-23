// 목표대학 라인별 1일 학습시간 가이드 (자습+인강+학원+숙제 합산)
import { UniversityLine, GradeLevel } from '@/types'
import { formatMinutes } from './config'

// 단위: 분 (엑셀 데이터 기준)
export const STUDY_GUIDE_MINUTES: Record<UniversityLine, Record<GradeLevel, number>> = {
  '서울대·의대':        { elementary: 600, middle: 780, high: 900 },
  '의학계열':           { elementary: 540, middle: 720, high: 780 },
  '스카이':             { elementary: 480, middle: 600, high: 720 },
  'Top10':              { elementary: 360, middle: 480, high: 600 },
  '건동홍(부산대,경북대)': { elementary: 240, middle: 360, high: 480 },
  '인서울':             { elementary: 180, middle: 240, high: 360 },
  '수도권 상':          { elementary: 120, middle: 180, high: 300 },
  '수도권 하':          { elementary: 60,  middle: 120, high: 180 },
}

export function getGuideMinutes(line?: UniversityLine, grade?: GradeLevel): number | null {
  if (!line || !grade) return null
  return STUDY_GUIDE_MINUTES[line]?.[grade] ?? null
}

export function getMotivationMessage(
  actualMinutes: number,
  guideMinutes: number,
  targetLine: string,
): string {
  if (actualMinutes === 0) {
    return `오늘 ${formatMinutes(guideMinutes)} 공부가 목표예요. 시작해봐요! 💪`
  }
  const ratio = actualMinutes / guideMinutes
  const diff = guideMinutes - actualMinutes

  if (ratio >= 1.3) return `완벽해요! 목표를 훌쩍 넘었어요. ${targetLine} 고고! 🚀`
  if (ratio >= 1.0) return `훌륭해요! 오늘 목표 달성! ${targetLine} 고고! 🎉`
  if (ratio >= 0.8) return `거의 다 왔어요! ${formatMinutes(diff)}만 더 하면 오늘 목표 달성이에요!`
  if (ratio >= 0.5) return `${formatMinutes(diff)}만 더 공부해보세요! 할 수 있어요 💪`
  return `하루에 ${formatMinutes(diff)}만 더 공부해보세요! ${targetLine} 도전 중이잖아요!`
}
