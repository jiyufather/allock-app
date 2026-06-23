// 올락 학습 리포트 Excel 내보내기 (SheetJS)
import * as XLSX from 'xlsx'
import { StudentReport } from './firestore'
import { formatMinutes } from './config'
import { SUBJECTS } from '@/types'

const DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

function h(minutes: number): string {
  const hr = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${hr}시간 ${m}분`
}

function pct(a: number, b: number): string {
  if (!b) return '-'
  return `${Math.round((a / b) * 100)}%`
}

export function exportStudentReportXlsx(report: StudentReport, schoolStart: string) {
  const wb = XLSX.utils.book_new()
  const { profile, weeks, grandTotal, grandPlannedTotal, subjectGrandTotals, subjectGrandPlannedTotals, totalDaysStudied, totalGoalAchievementRate } = report
  const goal = profile.goal

  // ── 시트 1: 학생 정보 & 목표 ────────────────────────────────────
  const infoRows: (string | number)[][] = [
    ['올락 썸머스쿨 학습 리포트'],
    [],
    ['이름', profile.name, '', '학교', profile.school],
    ['목표 대학', profile.targetUniversity ?? '-', '', '기간', `${schoolStart} ~ 4주`],
  ]
  if (goal) {
    infoRows.push(['일일 목표', h(goal.dailyMinutes), '', '주간 목표', h(goal.weeklyMinutes)])
    infoRows.push(['4주 목표 합계', h(goal.weeklyMinutes * 4), '', '목표 달성률', `${totalGoalAchievementRate}%`])
  }
  infoRows.push([])
  infoRows.push(['4주 순공 합계', h(grandTotal), '', '총 승인일', `${totalDaysStudied}일`])
  if (grandPlannedTotal > 0) {
    infoRows.push(['총 계획 합계', h(grandPlannedTotal), '', '실천율', pct(grandTotal, grandPlannedTotal)])
  }
  infoRows.push([])

  if (profile.grades) {
    infoRows.push(['현재 성적'])
    infoRows.push(['구분', '국어', '수학', '영어', '탐구'])
    infoRows.push(['내신',
      profile.grades.내신.국어 ?? '-', profile.grades.내신.수학 ?? '-',
      profile.grades.내신.영어 ?? '-', profile.grades.내신.탐구 ?? '-',
    ])
    infoRows.push(['모의고사',
      profile.grades.모의고사.국어 ?? '-', profile.grades.모의고사.수학 ?? '-',
      profile.grades.모의고사.영어 ?? '-', profile.grades.모의고사.탐구 ?? '-',
    ])
  }

  const wsInfo = XLSX.utils.aoa_to_sheet(infoRows)
  wsInfo['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 4 }, { wch: 14 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, wsInfo, '학생정보')

  // ── 시트 2~5: 주차별 ────────────────────────────────────────────
  for (const week of weeks) {
    const rows: (string | number)[][] = [
      [`올락 썸머스쿨 [${week.week}주차]`],
      [],
      ['순공시간', h(week.totalMinutes), '승인일수', `${week.daysStudied}일`],
    ]
    if (goal) {
      rows.push(['주간목표', h(goal.weeklyMinutes), '달성률', `${week.goalAchievementRate}%`])
    }
    if (week.plannedTotalMinutes > 0) {
      rows.push(['계획시간', h(week.plannedTotalMinutes), '실천율', pct(week.totalMinutes, week.plannedTotalMinutes)])
    }
    rows.push([])

    // 과목별
    rows.push(['과목', '실제', '계획', '실천율', '공부 내용'])
    for (const sub of SUBJECTS) {
      const actual = week.subjectTotals[sub] ?? 0
      const planned = week.subjectPlannedTotals[sub] ?? 0
      const contents = (week.subjectContents[sub] ?? []).join(', ')
      if (!actual && !planned) continue
      rows.push([sub, h(actual), planned ? h(planned) : '-', pct(actual, planned), contents])
    }
    rows.push([])

    // 요일별
    rows.push(['요일별 순공시간'])
    rows.push(['구분', ...DAYS])
    rows.push(['순공', ...DAYS.map(d => h(week.dailyTotals[d] ?? 0))])
    if (goal) {
      rows.push(['일일목표달성률', ...DAYS.map(d => pct(week.dailyTotals[d] ?? 0, goal.dailyMinutes))])
    }

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, ws, `${week.week}주차`)
  }

  // ── 시트 6: 최종 리포트 ─────────────────────────────────────────
  const wkLabels = weeks.map(w => `${w.week}주차`)
  const finalRows: (string | number)[][] = [
    ['올락 썸머스쿨 FINAL REPORT'],
    [],
    ['구분', ...wkLabels, '합계'],
  ]

  // 주차별 순공
  finalRows.push(['순공시간', ...weeks.map(w => h(w.totalMinutes)), h(grandTotal)])

  // 목표 달성률
  if (goal) {
    finalRows.push(['주간목표', ...weeks.map(() => h(goal.weeklyMinutes)), h(goal.weeklyMinutes * 4)])
    finalRows.push(['달성률', ...weeks.map(w => `${w.goalAchievementRate}%`), `${totalGoalAchievementRate}%`])
  }

  // 계획 vs 실적
  if (grandPlannedTotal > 0) {
    finalRows.push(['계획시간', ...weeks.map(w => h(w.plannedTotalMinutes)), h(grandPlannedTotal)])
    finalRows.push(['실천율', ...weeks.map(w => pct(w.totalMinutes, w.plannedTotalMinutes)), pct(grandTotal, grandPlannedTotal)])
  }

  finalRows.push([])

  // 과목별 누적
  finalRows.push(['과목별 순공시간'])
  finalRows.push(['과목', ...wkLabels, '합계', '공부 내용 (4주 통합)'])
  for (const sub of SUBJECTS) {
    const allContents = [...new Set(weeks.flatMap(w => w.subjectContents[sub] ?? []))].join(', ')
    finalRows.push([
      sub,
      ...weeks.map(w => h(w.subjectTotals[sub] ?? 0)),
      h(subjectGrandTotals[sub] ?? 0),
      allContents || '-',
    ])
  }

  finalRows.push([])
  finalRows.push(['총 승인일', `${totalDaysStudied}일`])

  const wsFinal = XLSX.utils.aoa_to_sheet(finalRows)
  wsFinal['!cols'] = [{ wch: 10 }, ...Array(weeks.length).fill({ wch: 12 }), { wch: 12 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, wsFinal, '최종리포트')

  XLSX.writeFile(wb, `올락_${profile.name}_리포트.xlsx`)
}

export interface BranchStudentRow {
  name: string
  school: string
  gradeLabel: string
  code: string
  period: string
  dailyAvgMinutes: number
  totalMinutes: number
  achievementRate: number
}

export function exportBranchDetailXlsx(branchName: string, rows: BranchStudentRow[]) {
  const wb = XLSX.utils.book_new()
  const headers = ['학생명', '학교(지점)', '학교급', '학생코드', '썸머스쿨기간', '일평균순공', '누적순공', '달성률']
  const dataRows = rows.map(r => [
    r.name, r.school, r.gradeLabel, r.code, r.period,
    h(r.dailyAvgMinutes), h(r.totalMinutes), `${r.achievementRate}%`,
  ])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
  ws['!cols'] = [
    { wch: 10 }, { wch: 16 }, { wch: 8 }, { wch: 14 },
    { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 8 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, '지점세부정보')
  XLSX.writeFile(wb, `올락_${branchName}_학생현황.xlsx`)
}

export async function parseBranchCodesFromXlsx(file: File): Promise<Array<{ code: string; branchName: string }>> {
  const data = await file.arrayBuffer()
  const wb = XLSX.read(data)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  if (rows.length < 2) return []

  const header = (rows[0] as string[]).map(h => String(h).trim())
  const codeCol = header.findIndex(h => h === '학생코드')
  const branchCol = header.findIndex(h => h === '현재지점')
  const statusCol = header.findIndex(h => h === '상태')

  if (codeCol !== -1 && branchCol !== -1) {
    // 결제현황 파일 형식: 학생코드(M열) + 현재지점(C열)
    const seen = new Set<string>()
    const result: Array<{ code: string; branchName: string }> = []
    for (const row of rows.slice(1) as unknown[][]) {
      const code = String(row[codeCol] ?? '').trim()
      const branchName = String(row[branchCol] ?? '').trim()
      if (!code || !branchName || code === '') continue
      if (statusCol !== -1 && String(row[statusCol]).trim() !== '입금완료') continue
      if (seen.has(code)) continue
      seen.add(code)
      result.push({ code, branchName })
    }
    return result
  }

  // fallback: A열=코드, B열=지점명 단순 형식
  const simpleRows = XLSX.utils.sheet_to_json<{ code: string; branchName: string }>(ws, { header: ['code', 'branchName'], range: 1 })
  return simpleRows.filter(r => r.code && r.branchName)
}
