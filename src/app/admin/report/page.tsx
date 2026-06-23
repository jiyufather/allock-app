'use client'
// 관리자 학생별 리포트 — 주차별 학습 현황 (일일 바차트 + 레이더 차트)

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { getAllStudents, getStudentReport, StudentReport, WeeklyReport } from '@/lib/firestore'
import { UserProfile, GRADE_LEVEL_LABELS, GradeLevel } from '@/types'
import { formatMinutes, SUMMER_START } from '@/lib/config'
import { exportStudentReportXlsx } from '@/lib/exportExcel'
import LoadingScreen from '@/components/LoadingScreen'

const DAYS_ORDER = ['월', '화', '수', '목', '금', '토', '일']
const SUBJ = ['국어', '수학', '영어', '탐구', '기타']
const SUBJ_COLORS: Record<string, string> = {
  국어: '#FFB3C6', 수학: '#C9B8FF', 영어: '#B8F0E6', 탐구: '#FFD5B8', 기타: '#FFF4B8',
}

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
    const top = sorted[0].s
    const low = sorted[sorted.length - 1].s
    txt += ` ${top} 학습량이 가장 많았으며, ${low} 학습 시간이 상대적으로 낮아 다음 주 보완이 필요합니다.`
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
      {/* 배경 격자 */}
      {[0.25, 0.5, 0.75, 1].map(ratio => (
        <polygon key={ratio}
          points={SUBJ.map((_, i) => { const p = pt(i, ratio); return `${p.x.toFixed(1)},${p.y.toFixed(1)}` }).join(' ')}
          fill="none"
          stroke={ratio === 1 ? '#d1d5db' : '#e5e7eb'}
          strokeWidth="0.8" />
      ))}
      {/* 축선 */}
      {SUBJ.map((_, i) => {
        const p = pt(i, 1)
        return <line key={i} x1={center} y1={center} x2={p.x.toFixed(1)} y2={p.y.toFixed(1)} stroke="#e5e7eb" strokeWidth="0.8" />
      })}
      {/* 데이터 폴리곤 */}
      <path d={dataPath} fill="#C9B8FF44" stroke="#A78BFA" strokeWidth="1.5" />
      {/* 라벨 */}
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

export default function AdminReportPage() {
  const { user, profile, loading, demoMode } = useAuth()
  const router = useRouter()
  const [students, setStudents] = useState<UserProfile[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<UserProfile | null>(null)
  const [report, setReport] = useState<StudentReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState(1)

  useEffect(() => {
    if (loading) return
    if (demoMode) return
    if (!user || !profile) { router.replace('/login'); return }
    if (profile.role === 'student' || profile.role === 'pending') {
      router.replace(profile.role === 'pending' ? '/pending' : '/dashboard')
      return
    }
  }, [loading, user, profile, router, demoMode])

  useEffect(() => {
    if (!profile) return
    if (!demoMode && !user) return
    if (profile.role !== 'super_admin' && profile.role !== 'branch_admin') return
    getAllStudents().then(list => {
      setStudents(list.filter(u => u.role === 'student'))
      setDataLoading(false)
    })
  }, [user, profile, demoMode])

  async function selectStudent(student: UserProfile) {
    setSelected(student)
    setReport(null)
    setSelectedWeek(1)
    setReportLoading(true)
    const r = await getStudentReport(student.uid)
    setReport(r)
    if (r && r.weeks.length > 0) setSelectedWeek(r.weeks[r.weeks.length - 1].week)
    setReportLoading(false)
  }

  const filtered = students.filter(
    s =>
      s.name.includes(search) ||
      s.school.includes(search) ||
      (s.targetUniversity ?? '').includes(search),
  )

  if (loading || !profile) return <LoadingScreen />

  const weekData = report?.weeks.find(w => w.week === selectedWeek)
  const weeklyGoal = report?.profile.goal?.weeklyMinutes ?? 0
  const dailyGoal = report?.profile.goal?.dailyMinutes ?? 0
  const dailyData = DAYS_ORDER.map(day => ({ day, minutes: weekData?.dailyTotals[day] ?? 0 }))
  const chartMax = Math.max(dailyGoal * 1.5, ...dailyData.map(d => d.minutes), 1)
  const goalLinePct = dailyGoal > 0 ? Math.min(93, (dailyGoal / chartMax) * 100) : 0

  return (
    <div className="min-h-screen pb-8 lg:pl-56">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-purple-soft text-2xl hover:scale-110 transition-transform">
            ←
          </Link>
          <div>
            <h1 className="text-xl font-black text-purple-dark">학생 리포트</h1>
            <p className="text-sm text-gray-400">학생 선택 후 주차별 리포트를 확인하세요</p>
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-6 space-y-5 lg:space-y-0">

          {/* ── 학생 목록 ── */}
          <div className="space-y-3">
            <input
              type="text"
              placeholder="이름 / 학교 / 목표대학"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl border-2 border-purple-light bg-white/80 focus:border-purple-soft focus:outline-none text-sm"
            />
            {dataLoading ? (
              <div className="text-center py-8 text-gray-300 text-sm">로딩 중...</div>
            ) : (
              <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-0.5">
                {filtered.map(s => (
                  <button
                    key={s.uid}
                    onClick={() => selectStudent(s)}
                    className={`w-full text-left rounded-2xl px-4 py-3 border transition-all ${
                      selected?.uid === s.uid
                        ? 'bg-gradient-to-r from-purple-light to-pink-light border-purple-soft/50 shadow-lg'
                        : 'bg-white/70 border-purple-50 hover:bg-white/90 shadow-sm'
                    }`}
                  >
                    <p className="font-bold text-gray-700 text-sm">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.school} · {s.targetUniversity ?? '-'}</p>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-center text-gray-300 text-sm py-8">검색 결과 없음</p>
                )}
              </div>
            )}
          </div>

          {/* ── 리포트 영역 ── */}
          <div>
            {!selected ? (
              <div className="hidden lg:flex items-center justify-center h-64 bg-white/40 rounded-3xl border border-purple-50">
                <p className="text-gray-300 text-sm">← 학생을 선택하세요</p>
              </div>
            ) : reportLoading ? (
              <div className="text-center py-16">
                <div className="text-3xl animate-bounce mb-2">📊</div>
                <p className="text-gray-300 text-sm">리포트 생성 중...</p>
              </div>
            ) : !report ? (
              <div className="text-center py-16">
                <div className="text-3xl mb-2">📭</div>
                <p className="text-gray-400 text-sm">입력된 순공 기록이 없어요</p>
              </div>
            ) : (
              <div className="space-y-4">

                {/* 주차 탭 + Excel 다운로드 */}
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5 flex-1">
                    {report.weeks.map(w => (
                      <button
                        key={w.week}
                        onClick={() => setSelectedWeek(w.week)}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                          selectedWeek === w.week
                            ? 'bg-gradient-to-r from-purple-soft to-pink-soft text-white shadow'
                            : 'bg-white/70 text-gray-400 hover:bg-purple-light/30 hover:text-purple-dark border border-purple-50'
                        }`}
                      >
                        {w.week}주차
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => exportStudentReportXlsx(report, SUMMER_START)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-mint-light text-mint-dark font-bold text-xs hover:bg-mint-soft/40 transition-all flex-none"
                  >
                    📥 Excel
                  </button>
                </div>

                {weekData ? (
                  <>
                    {/* 학생 정보 바 */}
                    <div className="bg-white/80 rounded-2xl border border-purple-50 overflow-hidden">
                      <div className="grid grid-cols-5 divide-x divide-purple-50">
                        {[
                          { label: '학생명', value: report.profile.name },
                          { label: '지점', value: report.profile.school },
                          { label: '학년', value: report.profile.gradeLevel ? (GRADE_LEVEL_LABELS[report.profile.gradeLevel as GradeLevel] ?? '-') : '-' },
                          { label: '목표 대학', value: report.profile.targetUniversity ?? report.profile.targetLine ?? '-' },
                          { label: '주차', value: `${selectedWeek}주차` },
                        ].map(item => (
                          <div key={item.label} className="px-2 py-2.5 text-center">
                            <p className="text-[10px] text-gray-400">{item.label}</p>
                            <p className="text-sm font-bold text-gray-700 mt-0.5 truncate">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ① 주간 학습 요약 */}
                    <div className="bg-white/80 rounded-2xl border border-purple-50 p-4 space-y-3">
                      <p className="text-sm font-black text-purple-dark">① 주간 학습 요약</p>
                      {/* 1행: 목표 / 실제 / 달성률 */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: '목표 순공시간', value: formatMinutes(weeklyGoal) },
                          { label: '실제 순공시간', value: formatMinutes(weekData.totalMinutes), highlight: true },
                          { label: '달성률', value: `${weekData.goalAchievementRate}%`, accent: true },
                        ].map(item => (
                          <div key={item.label}
                            className={`rounded-2xl p-2.5 text-center ${
                              item.accent
                                ? (weekData.goalAchievementRate >= 100 ? 'bg-mint-light/60' : 'bg-pink-light/60')
                                : item.highlight ? 'bg-purple-light/40' : 'bg-gray-50'
                            }`}>
                            <p className="text-[10px] text-gray-400 leading-snug">{item.label}</p>
                            <p className={`text-sm font-black mt-0.5 whitespace-nowrap ${
                              item.accent ? 'text-purple-dark' : 'text-gray-700'
                            }`}>{item.value}</p>
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
                            <p className="text-sm font-black mt-0.5 whitespace-nowrap text-gray-700">{item.value}</p>
                          </div>
                        ))}
                      </div>
                      {/* AI 요약 텍스트 */}
                      <div className="bg-purple-light/20 rounded-xl px-3 py-2.5">
                        <p className="text-xs text-gray-600 leading-relaxed">
                          {summaryText(weekData, report.profile)}
                        </p>
                      </div>
                    </div>

                    {/* ② 일일 순공시간 현황 */}
                    <div className="bg-white/80 rounded-2xl border border-purple-50 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-black text-purple-dark">② 일일 순공시간 현황</p>
                        {dailyGoal > 0 && (
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                            <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="#F9A8D4" strokeWidth="1.5" strokeDasharray="3 2" /></svg>
                            일일 목표 {formatMinutes(dailyGoal)}
                          </div>
                        )}
                      </div>

                      {/* 바 차트 */}
                      <div>
                        <div className="relative h-[100px]">
                          {/* 목표 점선 */}
                          {dailyGoal > 0 && (
                            <div
                              className="absolute left-0 right-0 border-t border-dashed border-pink-soft/70 pointer-events-none z-10"
                              style={{ bottom: `${goalLinePct}%` }}
                            />
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
                                  <div
                                    className="w-full rounded-t-md transition-all"
                                    style={{
                                      height: barPct > 0 ? `${barPct}%` : '3px',
                                      backgroundColor: meetsGoal ? '#7DDFD0' : minutes > 0 ? '#C9B8FF' : '#e5e7eb',
                                    }}
                                  />
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        {/* 요일 라벨 */}
                        <div className="flex gap-1 mt-1">
                          {dailyData.map(({ day }) => (
                            <div key={day} className="flex-1 text-center text-[10px] font-bold text-gray-400">{day}</div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* ③ 과목별 학습 비중 */}
                    <div className="bg-white/80 rounded-2xl border border-purple-50 p-4 space-y-3">
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
                                      <span className="w-2 h-2 rounded-sm flex-none" style={{ backgroundColor: SUBJ_COLORS[s] }} />
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
                          <RadarChart totals={weekData.subjectTotals} size={130} />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-10 bg-white/60 rounded-2xl border border-purple-50">
                    <p className="text-gray-400 text-sm">선택한 주차 데이터가 없어요</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
