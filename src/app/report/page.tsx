'use client'
// 내 학습 리포트 — 주간 요약, 일일 바차트, 과목별 레이더 차트

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getStudentReport, StudentReport, WeeklyReport } from '@/lib/firestore'
import { formatMinutes, SUMMER_START, getWeekFromDate, toDateStr } from '@/lib/config'
import { SUBJECTS, SUBJECT_COLORS, Subject, UserProfile } from '@/types'
import { exportStudentReportXlsx } from '@/lib/exportExcel'
import BottomNav from '@/components/BottomNav'
import LoadingScreen from '@/components/LoadingScreen'

const DAYS_ORDER = ['월', '화', '수', '목', '금', '토', '일'] as const
const SUBJ = ['국어', '수학', '영어', '탐구', '기타'] as const

function summaryText(w: WeeklyReport, profile: UserProfile): string {
  const rate = w.goalAchievementRate
  const sorted = SUBJ
    .filter(s => s !== '기타')
    .map(s => ({ s, v: w.subjectTotals[s] ?? 0 }))
    .filter(x => x.v > 0)
    .sort((a, b) => b.v - a.v)

  let txt = `이번 주 학습 요약 — 목표 대비 ${rate}%를 달성했으며, `
  if (rate >= 100) txt += '훌륭하게 목표를 초과 달성했습니다.'
  else if (rate >= 80) txt += '전반적으로 안정적인 학습 루틴을 유지했습니다.'
  else if (rate >= 50) txt += '목표에 다소 미달했어요. 다음 주 더 집중해봐요.'
  else txt += '학습량이 목표에 많이 미달했습니다. 컨디션을 점검해봐요.'

  if (sorted.length >= 2) {
    txt += ` ${sorted[0].s} 학습량이 가장 많았으며, ${sorted[sorted.length - 1].s} 학습 시간이 상대적으로 낮아 다음 주 보완이 필요합니다.`
  } else if (sorted.length === 1) {
    txt += ` ${sorted[0].s} 위주로 학습이 이루어졌습니다.`
  }
  return txt
}

function RadarChart({ totals, size = 130 }: { totals: Record<string, number>; size?: number }) {
  const center = size / 2
  const r = size * 0.32
  const n = SUBJ.length
  const maxVal = Math.max(1, ...SUBJ.map(s => totals[s] ?? 0))

  const angle = (i: number) => (i * 2 * Math.PI / n) - Math.PI / 2
  const pt = (i: number, ratio: number) => ({
    x: center + r * ratio * Math.cos(angle(i)),
    y: center + r * ratio * Math.sin(angle(i)),
  })

  const dataPath = SUBJ.map((s, i) => {
    const ratio = (totals[s] ?? 0) / maxVal
    const p = pt(i, ratio)
    return `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  }).join(' ') + ' Z'

  return (
    <svg width={size} height={size}>
      {[0.25, 0.5, 0.75, 1].map(ratio => (
        <polygon key={ratio}
          points={SUBJ.map((_, i) => { const p = pt(i, ratio); return `${p.x.toFixed(1)},${p.y.toFixed(1)}` }).join(' ')}
          fill="none"
          stroke={ratio === 1 ? '#d1d5db' : '#e5e7eb'}
          strokeWidth="0.8" />
      ))}
      {SUBJ.map((_, i) => {
        const p = pt(i, 1)
        return <line key={i} x1={center} y1={center} x2={p.x.toFixed(1)} y2={p.y.toFixed(1)} stroke="#e5e7eb" strokeWidth="0.8" />
      })}
      <path d={dataPath} fill="#C9B8FF44" stroke="#A78BFA" strokeWidth="1.5" />
      {SUBJ.map((s, i) => {
        const p = pt(i, 1.35)
        const pct = maxVal > 0 ? Math.round((totals[s] ?? 0) / maxVal * 100) : 0
        return (
          <text key={s}
            x={p.x.toFixed(1)} y={p.y.toFixed(1)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="8" fontWeight="700" fill="#6b7280">
            {s} {pct}%
          </text>
        )
      })}
    </svg>
  )
}

export default function MyReportPage() {
  const { user, profile, loading, demoMode } = useAuth()
  const router = useRouter()
  const [report, setReport] = useState<StudentReport | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState<number | 'final'>(1)
  const [pdfLoading, setPdfLoading] = useState(false)
  const reportPdfRef = useRef<HTMLDivElement>(null)

  async function downloadPdf() {
    if (!reportPdfRef.current || !profile) return
    setPdfLoading(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')
      const canvas = await html2canvas(reportPdfRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f5f3ff',
        logging: false,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = (canvas.height * pdfW) / canvas.width
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH)
      const weekLabel = selectedWeek === 'final' ? '최종' : `${selectedWeek}주차`
      pdf.save(`${profile.name}_${weekLabel}_리포트.pdf`)
    } finally {
      setPdfLoading(false)
    }
  }

  useEffect(() => {
    if (loading) return
    if (demoMode) return
    if (!user || !profile) { router.replace('/login'); return }
    if (profile.role === 'pending') { router.replace('/pending'); return }
  }, [loading, user, profile, router, demoMode])

  useEffect(() => {
    if (!profile || (!demoMode && !user)) return
    getStudentReport(profile.uid).then(r => {
      setReport(r)
      if (r && r.weeks.length > 0) {
        const currentWeek = getWeekFromDate(toDateStr(new Date()), profile)
        setSelectedWeek(Math.min(Math.max(currentWeek, 1), r.weeks.length))
      }
      setDataLoading(false)
    })
  }, [user, profile, demoMode])

  if (loading || !profile) return <LoadingScreen />

  const goal = profile.goal

  // 선택 주차 데이터
  const weekData = selectedWeek !== 'final'
    ? report?.weeks.find(w => w.week === selectedWeek)
    : undefined

  const dailyGoal = goal?.dailyMinutes ?? 0
  const weeklyGoal = goal?.weeklyMinutes ?? 0
  const dailyData = DAYS_ORDER.map(day => ({ day, minutes: weekData?.dailyTotals[day] ?? 0 }))
  const chartMax = Math.max(dailyGoal * 1.5, ...dailyData.map(d => d.minutes), 1)
  const goalLinePct = dailyGoal > 0 ? Math.min(93, (dailyGoal / chartMax) * 100) : 0

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-purple-dark">내 리포트</h1>
            <p className="text-sm text-gray-400">{profile.name} · {profile.school}</p>
          </div>
          {report && (
            <div className="flex gap-2">
              <button
                onClick={downloadPdf}
                disabled={pdfLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-pink-light text-pink-dark font-bold text-xs hover:bg-pink-soft/30 transition-all disabled:opacity-50"
              >
                <span>📄</span> {pdfLoading ? '생성 중...' : 'PDF'}
              </button>
              <button
                onClick={() => exportStudentReportXlsx(report, SUMMER_START)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-mint-light text-mint-dark font-bold text-xs hover:bg-mint-soft/40 transition-all"
              >
                <span>📥</span> Excel
              </button>
            </div>
          )}
        </div>

        {dataLoading ? (
          <div className="text-center py-16 text-gray-300 text-sm">리포트 생성 중...</div>
        ) : !report ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-2">📭</div>
            <p className="text-gray-400 text-sm">아직 승인된 순공 기록이 없어요</p>
          </div>
        ) : (
          <>
            {/* 4주 전체 요약 카드 */}
            <div className="bg-gradient-to-br from-purple-light to-pink-light rounded-3xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-purple-dark/70">4주 전체 순공시간</p>
                  <p className="text-2xl font-black text-purple-dark">{formatMinutes(report.grandTotal)}</p>
                  <p className="text-xs text-purple-dark/60 mt-0.5">
                    {report.totalDaysStudied}일 승인 완료 · 달성률 {report.totalGoalAchievementRate}%
                  </p>
                </div>
                {goal && (
                  <div className="text-right">
                    <p className="text-xs text-purple-dark/60">목표</p>
                    <p className="text-sm font-black text-purple-dark">{formatMinutes(weeklyGoal * 4)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 주차 탭 */}
            <div className="flex gap-1 bg-white/60 rounded-2xl p-1 overflow-x-auto">
              {report.weeks.map(w => (
                <button key={w.week} onClick={() => setSelectedWeek(w.week)}
                  className={`flex-1 min-w-[52px] py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    selectedWeek === w.week
                      ? 'bg-gradient-to-r from-purple-soft to-pink-soft text-white shadow-lg'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}>
                  {w.week}주차
                </button>
              ))}
              <button onClick={() => setSelectedWeek('final')}
                className={`flex-1 min-w-[52px] py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  selectedWeek === 'final'
                    ? 'bg-gradient-to-r from-peach-soft to-pink-soft text-white shadow-lg'
                    : 'text-gray-400 hover:text-gray-600'
                }`}>
                최종
              </button>
            </div>

            {/* ── 주차별 뷰 (PDF 캡처 범위) ── */}
            {weekData && (
              <div className="space-y-4" ref={reportPdfRef}
                style={{ backgroundColor: '#f5f3ff', padding: '12px', borderRadius: '16px' }}>

                {/* ① 주간 학습 요약 */}
                <div className="bg-white/80 rounded-3xl p-5 shadow-lg shadow-purple-100/20 border border-purple-50 space-y-3">
                  <p className="text-sm font-black text-purple-dark">① 주간 학습 요약</p>
                  {/* 1행: 목표 / 실제 / 달성률 */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: '목표 순공', value: formatMinutes(weeklyGoal) },
                      { label: '실제 순공', value: formatMinutes(weekData.totalMinutes), highlight: true },
                      { label: '달성률', value: `${weekData.goalAchievementRate}%`, accent: true },
                    ].map(item => (
                      <div key={item.label}
                        className={`rounded-2xl p-2.5 text-center ${
                          item.accent
                            ? (weekData.goalAchievementRate >= 100 ? 'bg-mint-light/60' : 'bg-pink-light/60')
                            : item.highlight ? 'bg-purple-light/40' : 'bg-gray-50'
                        }`}>
                        <p className="text-[10px] text-gray-400 leading-snug">{item.label}</p>
                        <p className={`text-sm font-black mt-0.5 whitespace-nowrap ${item.accent ? 'text-purple-dark' : 'text-gray-700'}`}>
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                  {/* 2행: 일평균 / 출석일 */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: '일평균 순공', value: formatMinutes(Math.round(weekData.totalMinutes / 7)) },
                      { label: '출석일', value: `${weekData.daysStudied}일` },
                    ].map(item => (
                      <div key={item.label} className="rounded-2xl p-2.5 text-center bg-gray-50">
                        <p className="text-[10px] text-gray-400 leading-snug">{item.label}</p>
                        <p className="text-sm font-black mt-0.5 whitespace-nowrap text-gray-700">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-purple-light/20 rounded-xl px-3 py-2.5">
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {summaryText(weekData, profile)}
                    </p>
                  </div>
                </div>

                {/* ② 일일 순공시간 현황 */}
                <div className="bg-white/80 rounded-3xl p-5 shadow-lg shadow-purple-100/20 border border-purple-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-purple-dark">② 일일 순공시간 현황</p>
                    {dailyGoal > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                        <svg width="16" height="4">
                          <line x1="0" y1="2" x2="16" y2="2" stroke="#F9A8D4" strokeWidth="1.5" strokeDasharray="3 2" />
                        </svg>
                        목표 {formatMinutes(dailyGoal)}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="relative h-[100px]">
                      {dailyGoal > 0 && (
                        <div className="absolute left-0 right-0 border-t border-dashed border-pink-soft/70 pointer-events-none z-10"
                          style={{ bottom: `${goalLinePct}%` }} />
                      )}
                      <div className="flex gap-1 items-end h-full">
                        {dailyData.map(({ day, minutes }) => {
                          const barPct = minutes > 0 ? Math.max((minutes / chartMax) * 100, 4) : 0
                          const meetsGoal = dailyGoal > 0 && minutes >= dailyGoal
                          return (
                            <div key={day} className="flex-1 h-full flex flex-col items-center justify-end gap-0.5">
                              {minutes > 0 && (
                                <span className="text-[9px] font-bold text-gray-500 leading-none">
                                  {formatMinutes(minutes)}
                                </span>
                              )}
                              <div className="w-full rounded-t-md transition-all"
                                style={{
                                  height: barPct > 0 ? `${barPct}%` : '3px',
                                  backgroundColor: meetsGoal ? '#7DDFD0' : minutes > 0 ? '#C9B8FF' : '#e5e7eb',
                                }} />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div className="flex gap-1 mt-1">
                      {dailyData.map(({ day }) => (
                        <div key={day} className="flex-1 text-center text-[10px] font-bold text-gray-400">{day}</div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ③ 과목별 학습 비중 */}
                <div className="bg-white/80 rounded-3xl p-5 shadow-lg shadow-purple-100/20 border border-purple-50 space-y-3">
                  <p className="text-sm font-black text-purple-dark">③ 과목별 학습 비중</p>
                  <div className="flex gap-4 items-center">
                    {/* 세로형 테이블 (과목이 행) */}
                    <table className="flex-1 text-xs border-collapse">
                      <thead>
                        <tr className="bg-purple-light/30">
                          <th className="text-left text-gray-500 font-bold px-2 py-1.5 border border-purple-100">과목</th>
                          <th className="text-center text-gray-600 font-bold px-2 py-1.5 border border-purple-100">순공</th>
                          <th className="text-center text-gray-600 font-bold px-2 py-1.5 border border-purple-100">비중</th>
                        </tr>
                      </thead>
                      <tbody>
                        {SUBJ.map(s => {
                          const mins = weekData.subjectTotals[s] ?? 0
                          const pct = weekData.totalMinutes > 0
                            ? Math.round((mins / weekData.totalMinutes) * 100)
                            : 0
                          return (
                            <tr key={s}>
                              <td className="px-2 py-1.5 border border-purple-100">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-sm flex-none"
                                    style={{ backgroundColor: SUBJECT_COLORS[s as Subject] ?? '#e5e7eb' }} />
                                  <span className="font-bold text-gray-700">{s}</span>
                                </span>
                              </td>
                              <td className="text-center font-bold text-gray-700 px-2 py-1.5 border border-purple-100 whitespace-nowrap">
                                {mins > 0 ? `${Math.floor(mins/60)}:${String(mins%60).padStart(2,'0')}` : '-'}
                              </td>
                              <td className="text-center text-gray-600 px-2 py-1.5 border border-purple-100">
                                {pct > 0 ? `${pct}%` : '-'}
                              </td>
                            </tr>
                          )
                        })}
                        <tr className="bg-purple-light/20">
                          <td className="px-2 py-1.5 border border-purple-100 font-black text-purple-dark">합계</td>
                          <td className="text-center font-black text-purple-dark px-2 py-1.5 border border-purple-100 whitespace-nowrap">
                            {Math.floor(weekData.totalMinutes/60)}:{String(weekData.totalMinutes%60).padStart(2,'0')}
                          </td>
                          <td className="text-center font-bold text-purple-dark px-2 py-1.5 border border-purple-100">100%</td>
                        </tr>
                      </tbody>
                    </table>
                    {/* 레이더 차트 */}
                    <div className="flex-none">
                      <RadarChart totals={weekData.subjectTotals} size={120} />
                    </div>
                  </div>
                </div>

                {/* 과목별 공부 내용 */}
                {SUBJ.some(s => (weekData.subjectContents[s]?.length ?? 0) > 0) && (
                  <div className="bg-white/80 rounded-3xl p-5 shadow-lg shadow-purple-100/20 border border-purple-50 space-y-3">
                    <p className="text-sm font-black text-purple-dark">공부 내용</p>
                    {SUBJ.map(s => {
                      const contents = weekData.subjectContents[s] ?? []
                      if (contents.length === 0) return null
                      return (
                        <div key={s} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-sm flex-none"
                              style={{ backgroundColor: SUBJECT_COLORS[s as Subject] ?? '#e5e7eb' }} />
                            <span className="text-xs font-bold text-gray-600">{s}</span>
                            <span className="text-xs text-gray-400">{formatMinutes(weekData.subjectTotals[s] ?? 0)}</span>
                          </div>
                          <div className="pl-4 flex flex-wrap gap-1">
                            {contents.map(c => (
                              <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{c}</span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── 최종 리포트 뷰 ── */}
            {selectedWeek === 'final' && (
              <div className="space-y-4">
                {/* 4주 달성 요약 */}
                {goal && (
                  <div className="bg-white/80 rounded-3xl p-5 shadow-xl shadow-purple-100/30 border border-purple-50 space-y-3">
                    <p className="text-sm font-black text-purple-dark">4주 전체 달성 현황</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: '총 목표', value: formatMinutes(weeklyGoal * 4) },
                        { label: '총 순공', value: formatMinutes(report.grandTotal), highlight: true },
                        { label: '달성률', value: `${report.totalGoalAchievementRate}%`, accent: true },
                      ].map(item => (
                        <div key={item.label}
                          className={`rounded-2xl p-3 text-center ${
                            item.accent
                              ? (report.totalGoalAchievementRate >= 100 ? 'bg-mint-light/60' : 'bg-pink-light/60')
                              : item.highlight ? 'bg-purple-light/40' : 'bg-gray-50'
                          }`}>
                          <p className="text-xs text-gray-400">{item.label}</p>
                          <p className={`text-base font-black mt-0.5 ${item.accent ? 'text-purple-dark' : 'text-gray-700'}`}>
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 text-center">총 {report.totalDaysStudied}일 승인 완료</p>
                  </div>
                )}

                {/* 주차별 비교 */}
                <div className="bg-white/80 rounded-3xl p-5 shadow-lg shadow-purple-100/20 border border-purple-50 space-y-3">
                  <p className="text-sm font-black text-purple-dark">주차별 순공시간</p>
                  {report.weeks.map(w => {
                    const maxWeek = Math.max(1, ...report.weeks.map(ww => ww.totalMinutes))
                    return (
                      <div key={w.week} className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-gray-500 w-10">{w.week}주차</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-purple-soft to-pink-soft transition-all"
                              style={{ width: `${(w.totalMinutes / maxWeek) * 100}%` }} />
                          </div>
                          <span className="text-xs font-bold text-purple-dark w-20 text-right">{formatMinutes(w.totalMinutes)}</span>
                        </div>
                        {goal && (
                          <div className="pl-14 flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div className="h-full rounded-full bg-mint-soft transition-all"
                                style={{ width: `${w.goalAchievementRate}%` }} />
                            </div>
                            <span className="text-xs text-mint-dark font-bold w-12 text-right">{w.goalAchievementRate}%</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* 4주 누적 과목별 */}
                <div className="bg-white/80 rounded-3xl p-5 shadow-lg shadow-purple-100/20 border border-purple-50 space-y-3">
                  <p className="text-sm font-black text-purple-dark">과목별 누적 순공시간</p>
                  <div className="flex gap-3 items-start">
                    <div className="flex-1 space-y-2.5">
                      {SUBJ.map(s => {
                        const min = report.subjectGrandTotals[s] ?? 0
                        const maxSub = Math.max(1, ...SUBJ.map(ss => report.subjectGrandTotals[ss] ?? 0))
                        const allContents = [...new Set(report.weeks.flatMap(w => w.subjectContents[s] ?? []))]
                        return (
                          <div key={s} className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-500 w-8">{s}</span>
                              <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                <div className="h-full rounded-full transition-all"
                                  style={{ width: `${(min / maxSub) * 100}%`, backgroundColor: SUBJECT_COLORS[s as Subject] ?? '#e5e7eb' }} />
                              </div>
                              <span className="text-xs font-bold text-gray-600 w-16 text-right">{formatMinutes(min)}</span>
                            </div>
                            {allContents.length > 0 && (
                              <div className="pl-10 flex flex-wrap gap-1">
                                {allContents.slice(0, 4).map(c => (
                                  <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{c}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex-none">
                      <RadarChart totals={report.subjectGrandTotals} size={120} />
                    </div>
                  </div>
                </div>

                {/* 목표 대학 */}
                {profile.targetUniversity && (
                  <div className="bg-gradient-to-r from-peach-light to-yellow-soft rounded-3xl p-4 flex items-center gap-3">
                    <span className="text-3xl">🎯</span>
                    <div>
                      <p className="text-xs text-gray-500">목표 대학</p>
                      <p className="font-black text-gray-700">{profile.targetUniversity}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
