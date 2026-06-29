'use client'
// 학생 대시보드 — 상단 요약바, 목표 달성 현황, 주간 차트, 캘린더+일별 계획

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { getMyLogs, getCachedRankings, getLogForDate } from '@/lib/firestore'
import { StudyLog, SUBJECT_COLORS, Subject, SUBJECTS } from '@/types'
import { formatMinutes, toDateStr, getWeekFromDate, getEffectiveSummerDates } from '@/lib/config'
import { getGuideMinutes, getMotivationMessage } from '@/lib/studyGuide'
import { SCHEDULE_DAYS, HOUR_SLOTS, colorForActivity } from '@/lib/schedule'
import BottomNav from '@/components/BottomNav'
import LoadingScreen from '@/components/LoadingScreen'

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']
const DOW = ['일', '월', '화', '수', '목', '금', '토']

// 분 → "10H" / "4.5H" 형태
function formatH(mins: number): string {
  const h = mins / 60
  return h % 1 === 0 ? `${h}H` : `${h.toFixed(1)}H`
}

// 캘린더 날짜 배열 (빈 셀은 null)
function getCalendarDays(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return cells
}

function getWeekDates(weekNum: number, summerStart: string): string[] {
  const start = new Date(summerStart)
  const weekStart = new Date(start)
  weekStart.setDate(start.getDate() + (weekNum - 1) * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return toDateStr(d)
  })
}

function GoalBar({ label, actual, target, color = 'from-purple-soft to-pink-soft' }: {
  label: string; actual: number; target: number; color?: string
}) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-gray-600">{label}</span>
        <span className="font-bold text-purple-dark">
          {formatMinutes(actual)}{' '}
          <span className="font-normal text-gray-400">/ {formatMinutes(target)} ({pct}%)</span>
        </span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function RingProgress({ pct, size = 90, strokeWidth = 9 }: {
  pct: number; size?: number; strokeWidth?: number
}) {
  const r = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * r
  const filled = circumference * Math.min(pct / 100, 1)
  const color = pct >= 100 ? '#7DDFD0' : pct >= 80 ? '#C9B8FF' : pct >= 50 ? '#FFB3C6' : '#FBBF24'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${filled} ${circumference}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }} />
    </svg>
  )
}

export default function DashboardPage() {
  const { user, profile, loading, demoMode } = useAuth()
  const router = useRouter()

  const [myLogs, setMyLogs] = useState<StudyLog[]>([])
  const [myRank, setMyRank] = useState<number | null>(null)
  const [rankUpdatedAt, setRankUpdatedAt] = useState<string | null>(null)
  const [streak, setStreak] = useState(0)
  const [dataLoading, setDataLoading] = useState(true)

  // 비밀번호 변경
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwSubmitting, setPwSubmitting] = useState(false)

  // 캘린더 + 일별 계획
  const today = toDateStr(new Date())
  const yesterday = toDateStr(new Date(Date.now() - 86400000))
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedLog, setSelectedLog] = useState<StudyLog | null>(null)
  const [loadingSelectedLog, setLoadingSelectedLog] = useState(false)
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const logCache = useRef<Record<string, StudyLog | null>>({})

  useEffect(() => {
    if (loading) return
    if (demoMode) return
    if (!user || !profile) { router.replace('/login'); return }
    if (profile.role === 'pending') { router.replace('/pending'); return }
    if (profile.role === 'super_admin' || profile.role === 'branch_admin') { router.replace('/admin'); return }
  }, [loading, user, profile, router, demoMode])

  useEffect(() => {
    if (!profile || (!demoMode && !user)) return
    if (profile.role !== 'student') return

    async function load() {
      const uid = profile!.uid
      const [logs, cachedRanking, todayEntry] = await Promise.all([
        getMyLogs(uid),
        getCachedRankings(),
        getLogForDate(uid, today),
      ])
      const approvedLogs = logs.filter(l => l.status === 'approved')
      setMyLogs(approvedLogs)

      // 캐시 초기화
      logCache.current = {}
      for (const log of approvedLogs) logCache.current[log.date] = log
      if (todayEntry) logCache.current[today] = todayEntry
      setSelectedLog(logCache.current[today] ?? null)

      const me = cachedRanking?.studentRanking.find(s => s.uid === uid)
      setMyRank(me?.rank ?? null)
      setRankUpdatedAt(cachedRanking?.updatedAt ?? null)

      const dateSet = new Set(approvedLogs.map(l => l.date))
      let s = 0
      for (let i = 0; i < 30; i++) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        if (d.getDay() === 0) continue // 일요일은 휴식일 — streak를 끊지 않음
        if (dateSet.has(toDateStr(d))) s++
        else break
      }
      setStreak(s)
      setDataLoading(false)
    }
    load()
  }, [user, profile, demoMode])

  async function selectDate(dateStr: string) {
    setSelectedDate(dateStr)
    if (dateStr in logCache.current) {
      setSelectedLog(logCache.current[dateStr])
      return
    }
    setLoadingSelectedLog(true)
    const log = await getLogForDate(profile!.uid, dateStr)
    logCache.current[dateStr] = log
    setSelectedLog(log)
    setLoadingSelectedLog(false)
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    if (newPassword.length < 6) { setPwError('새 비밀번호는 6자 이상이어야 해요.'); return }
    if (newPassword !== newPasswordConfirm) { setPwError('새 비밀번호가 일치하지 않아요.'); return }
    const currentUser = auth.currentUser
    if (!currentUser?.email) { setPwError('로그인 정보를 확인할 수 없어요.'); return }
    setPwSubmitting(true)
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword)
      await reauthenticateWithCredential(currentUser, credential)
      await updatePassword(currentUser, newPassword)
      setPwSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setNewPasswordConfirm('')
    } catch {
      setPwError('현재 비밀번호가 올바르지 않아요.')
    } finally {
      setPwSubmitting(false)
    }
  }

  if (loading || !profile) return <LoadingScreen />

  const currentWeek = getWeekFromDate(today, profile)
  const goal = profile.goal ?? { dailyMinutes: 300, weeklyMinutes: 1500 }
  const { start: effectiveStart } = getEffectiveSummerDates(profile)

  const weekLogs = myLogs.filter(l => l.week === currentWeek)
  const weekTotal = weekLogs.reduce((s, l) => s + l.totalMinutes, 0)
  const allTimeTotal = myLogs.reduce((s, l) => s + l.totalMinutes, 0)
  const fourWeekGoal = goal.weeklyMinutes * 4

  const yesterdayApproved = myLogs.find(l => l.date === yesterday)
  const yesterdayTotal = yesterdayApproved?.totalMinutes ?? 0
  const yesterdayGoalPct = goal.dailyMinutes > 0 ? Math.min(100, Math.round((yesterdayTotal / goal.dailyMinutes) * 100)) : 0

  const weekDates = getWeekDates(Math.max(1, currentWeek), effectiveStart)
  const dayLogMap = myLogs.reduce((acc, l) => {
    acc[l.date] = (acc[l.date] ?? 0) + l.totalMinutes
    return acc
  }, {} as Record<string, number>)
  const chartMax = Math.max(goal.dailyMinutes * 1.4, ...weekDates.map(d => dayLogMap[d] ?? 0), 1)
  const goalLinePct = Math.min(92, (goal.dailyMinutes / chartMax) * 100)

  const subjectTotals = weekLogs.reduce((acc, log) => {
    for (const sub of Object.keys(log.subjects) as Subject[]) {
      acc[sub] = (acc[sub] ?? 0) + (log.subjects[sub] ?? 0)
    }
    return acc
  }, {} as Record<Subject, number>)
  const maxSubjectMin = Math.max(1, ...Object.values(subjectTotals))

  const guideMinutes = getGuideMinutes(profile.targetLine, profile.gradeLevel)
  const motivationMsg = getMotivationMessage(
    yesterdayTotal,
    guideMinutes ?? goal.dailyMinutes,
    profile.targetLine ?? '목표',
  )

  const card = 'bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg shadow-purple-100/20 border border-purple-50'

  // 캘린더 데이터
  const calDays = getCalendarDays(calYear, calMonth)
  // 로그 있는 날짜 집합 (승인 + 오늘 계획 포함)
  const datesWithLog = new Set([
    ...myLogs.map(l => l.date),
    ...Object.keys(logCache.current).filter(d => logCache.current[d] !== null),
  ])

  return (
    <div className="min-h-screen pb-24 lg:pb-0 lg:pl-56">
      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-6 space-y-5">

        {/* ── 상단 요약 바 ── */}
        <div className={`${card} p-4 flex flex-wrap items-center gap-4`}>
          {/* 브랜드 (모바일) / 인사 (데스크탑) */}
          <div className="flex-none">
            <div className="lg:hidden flex items-center gap-1.5">
              <span className="text-xl">🔒</span>
              <div>
                <p className="text-base font-black text-purple-dark leading-none">올락(All Lock)</p>
                <p className="text-[10px] font-bold text-purple-dark/50 leading-none mt-0.5">잠그면, 오른다</p>
              </div>
            </div>
            <div className="hidden lg:block">
              <p className="text-gray-400 text-xs">안녕하세요 👋</p>
              <h1 className="text-lg font-black text-purple-dark">{profile.name}님</h1>
            </div>
          </div>

          <div className="hidden lg:block w-px h-8 bg-gray-100 flex-none" />

          {/* 연속 + 순위 */}
          <div className="flex gap-4 flex-none">
            <div className="text-center">
              <p className="font-black text-orange-400 text-sm">🔥 {streak}일</p>
              <p className="text-xs text-gray-400">연속 승인 중</p>
            </div>
            <div className="text-center" title="매일 00시에 업데이트돼요">
              <p className="font-black text-purple-dark text-sm">🏆 {myRank ? `${myRank}위` : '-'}</p>
              <p className="text-xs text-gray-400">전국 순위*</p>
            </div>
          </div>

          <div className="hidden lg:block w-px h-8 bg-gray-100 flex-none" />

          {/* 나의 목표 */}
          <div className="flex items-center gap-3 w-full lg:w-auto lg:flex-1 min-w-0">
            <div className="bg-purple-light/40 rounded-2xl px-3 py-2 flex-1 lg:flex-none min-w-0">
              <p className="text-xs text-gray-400 mb-0.5">나의 목표</p>
              <p className="font-black text-purple-dark text-sm truncate">
                🎯 {profile.targetUniversity ?? profile.targetLine ?? '미설정'}
              </p>
              {profile.targetLine && profile.targetUniversity && (
                <p className="text-xs text-purple-dark/60 truncate">{profile.targetLine}</p>
              )}
            </div>
            <div className="text-center flex-none">
              <p className="text-xs text-gray-400">하루 목표</p>
              <p className="text-xl lg:text-2xl font-black text-purple-dark">{formatH(goal.dailyMinutes)}</p>
            </div>
            <div className="text-center flex-none">
              <p className="text-xs text-gray-400">주간 목표</p>
              <p className="text-xl lg:text-2xl font-black text-purple-dark">{formatH(goal.weeklyMinutes)}</p>
            </div>
          </div>

          {/* 비밀번호 변경 + 로그아웃 */}
          <button onClick={() => { setShowPasswordModal(true); setPwError(''); setPwSuccess(false) }}
            className="text-xs text-gray-400 bg-white/60 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-all flex-none">
            🔑 비밀번호 변경
          </button>
          <button onClick={async () => { await signOut(auth); router.replace('/login') }}
            className="text-xs text-gray-400 bg-white/60 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-all flex-none">
            로그아웃
          </button>
        </div>

        <p className="text-xs text-gray-300 px-1">
          * 전국 순위는 매일 00시에 업데이트돼요
          {rankUpdatedAt && ` (마지막 업데이트 ${rankUpdatedAt.slice(5, 10).replace('-', '/')} ${rankUpdatedAt.slice(11, 16)})`}
        </p>

        {/* ── 2컬럼 메인 ── */}
        <div className="lg:grid lg:grid-cols-[1.1fr_1fr] lg:gap-6 space-y-5 lg:space-y-0">

          {/* ── 왼쪽: 달성 현황 + 차트 + 과목 ── */}
          <div className="space-y-5">

            {/* 목표 달성 현황 */}
            <div className={`${card} p-5 shadow-xl shadow-purple-100/30 space-y-4`}>
              <p className="text-sm font-bold text-gray-500">나의 목표 달성 현황</p>
              <div className="flex items-center gap-4">
                <div className="relative flex-none" style={{ width: 90, height: 90 }}>
                  <RingProgress pct={yesterdayGoalPct} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-lg font-black text-purple-dark leading-none">{yesterdayGoalPct}%</span>
                    <span className="text-[10px] text-gray-400 mt-0.5">어제</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="text-xs text-gray-400">
                    <span className="font-black text-purple-dark text-base">{formatMinutes(yesterdayTotal)}</span>
                    <span className="ml-1">/ {formatMinutes(goal.dailyMinutes)}</span>
                  </div>
                  <div className={`rounded-2xl px-3 py-2.5 ${
                    yesterdayGoalPct >= 100 ? 'bg-mint-light/60' :
                    yesterdayGoalPct >= 80  ? 'bg-purple-light/50' :
                    yesterdayGoalPct >= 50  ? 'bg-pink-soft/20' :
                    'bg-peach-light/50'
                  }`}>
                    <p className={`text-xs font-bold leading-snug ${
                      yesterdayGoalPct >= 100 ? 'text-teal-600' :
                      yesterdayGoalPct >= 50  ? 'text-purple-dark' :
                      'text-orange-500'
                    }`}>{motivationMsg}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3 pt-1 border-t border-gray-100">
                <GoalBar label={`${Math.max(1, currentWeek)}주차`} actual={weekTotal} target={goal.weeklyMinutes} color="from-purple-soft to-pink-soft" />
                <GoalBar label="최종 목표" actual={allTimeTotal} target={fourWeekGoal} color="from-mint-soft to-purple-soft" />
              </div>
            </div>

            {/* 이번 주 일별 순공시간 */}
            <div className={`${card} p-5`}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-gray-500">이번 주 일별 순공시간</p>
                <div className="flex items-center gap-1.5">
                  <div className="w-5 border-t-2 border-dashed border-purple-soft/70" />
                  <span className="text-xs text-gray-400">일일 목표</span>
                </div>
              </div>
              <div className="relative" style={{ height: '80px' }}>
                <div className="absolute w-full border-t-2 border-dashed border-purple-soft/60 pointer-events-none z-10"
                  style={{ bottom: `${goalLinePct}%` }} />
                <div className="flex gap-1.5 items-end h-full">
                  {weekDates.map((d) => {
                    const mins = dayLogMap[d] ?? 0
                    const barPct = mins > 0 ? Math.max((mins / chartMax) * 100, 4) : 0
                    const isFuture = d > today
                    const isToday = d === today
                    const meetsGoal = mins >= goal.dailyMinutes && mins > 0
                    return (
                      <div key={d} className="flex-1 h-full flex items-end">
                        <div className="w-full rounded-t-md transition-all duration-500" style={{
                          height: isFuture ? '3px' : barPct > 0 ? `${barPct}%` : '3px',
                          backgroundColor: isFuture ? '#e5e7eb' : meetsGoal ? '#7DDFD0' : mins > 0 ? '#C9B8FF' : '#e5e7eb',
                          opacity: isFuture ? 0.4 : isToday && mins === 0 ? 0.5 : 1,
                          outline: isToday ? '2px solid #9B85FF' : 'none',
                          outlineOffset: '1px',
                        }} />
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="flex gap-1.5 mt-2">
                {weekDates.map((d) => (
                  <div key={d} className="flex-1 text-center">
                    <span className="text-xs font-bold"
                      style={{ color: d === today ? '#9B85FF' : '#9ca3af' }}>
                      {DAY_KO[new Date(d + 'T12:00:00').getDay()]}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-3 text-xs text-gray-400">
                <span>이번 주 총 <span className="font-bold text-purple-dark">{formatMinutes(weekTotal)}</span></span>
                <span>목표 <span className="font-bold text-gray-500">{formatMinutes(goal.weeklyMinutes)}</span></span>
              </div>
            </div>

            {/* 나의 주간 학습 시간표 */}
            <div className={`${card} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-500">나의 주간 학습 시간표</p>
                <Link href="/goal" className="text-xs text-purple-dark/60 font-bold hover:underline">수정하기</Link>
              </div>
              {profile.weeklySchedule?.some(row => row.some(c => c)) ? (
                <div className="overflow-x-auto rounded-2xl border border-gray-100">
                  <table className="border-collapse text-[10px]" style={{ minWidth: '360px', width: '100%' }}>
                    <thead>
                      <tr className="bg-purple-light/30">
                        <th className="text-left text-gray-500 font-bold px-2 py-1 w-12 border-b border-gray-100">시간</th>
                        {SCHEDULE_DAYS.map(d => (
                          <th key={d} className="text-center text-gray-600 font-bold px-1 py-1 border-b border-gray-100">{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {HOUR_SLOTS.map((time, si) => (
                        <tr key={time} className={si % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                          <td className="text-gray-400 font-mono px-2 py-0.5 border-b border-gray-50 whitespace-nowrap">{time}</td>
                          {SCHEDULE_DAYS.map((_, di) => {
                            const act = profile.weeklySchedule?.[si]?.[di] ?? ''
                            return (
                              <td key={di} className="text-center px-0.5 py-0.5 border-b border-gray-50"
                                style={{ backgroundColor: act ? colorForActivity(act) + 'CC' : undefined }}>
                                <span className="block text-[10px] font-bold leading-none py-1 truncate px-0.5"
                                  style={{ color: act ? '#1f2937' : '#d1d5db' }}>
                                  {act || '·'}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Link href="/goal" className="block text-center py-6 text-xs text-gray-400 hover:text-purple-dark transition-all">
                  아직 시간표가 없어요. 눌러서 설정해보세요 →
                </Link>
              )}
            </div>

            {/* 과목별 순공 */}
            {Object.keys(subjectTotals).length > 0 && (
              <div className={`${card} p-5 space-y-3`}>
                <p className="text-sm font-bold text-gray-500">과목별 순공</p>
                {(Object.entries(subjectTotals) as [Subject, number][]).map(([sub, min]) => (
                  <div key={sub} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-500 w-8">{sub}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${(min / maxSubjectMin) * 100}%`, backgroundColor: SUBJECT_COLORS[sub] }} />
                    </div>
                    <span className="text-xs text-gray-400 w-16 text-right">{formatMinutes(min)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── 오른쪽: 캘린더 + 일별 계획 ── */}
          <div className="space-y-5">

            {/* 캘린더 */}
            <div className={`${card} p-4`}>
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-3">
                <button onClick={prevMonth}
                  className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-all">
                  ‹
                </button>
                <p className="text-sm font-bold text-gray-700">{calYear}년 {calMonth + 1}월</p>
                <button onClick={nextMonth}
                  className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-all">
                  ›
                </button>
              </div>

              {/* 요일 헤더 */}
              <div className="grid grid-cols-7 mb-1">
                {DOW.map((d, i) => (
                  <div key={d} className={`text-center text-xs font-bold py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
                    {d}
                  </div>
                ))}
              </div>

              {/* 날짜 셀 */}
              <div className="grid grid-cols-7 gap-y-0.5">
                {calDays.map((date, i) => {
                  if (!date) return <div key={i} />
                  const dayNum = new Date(date + 'T12:00:00').getDate()
                  const dow = new Date(date + 'T12:00:00').getDay()
                  const isToday = date === today
                  const isSelected = date === selectedDate
                  const hasLog = datesWithLog.has(date)
                  return (
                    <button key={date} onClick={() => selectDate(date)}
                      className={`relative flex flex-col items-center justify-center h-8 rounded-xl transition-all text-xs font-bold ${
                        isSelected
                          ? 'bg-purple-soft text-white'
                          : isToday
                            ? 'bg-purple-light text-purple-dark'
                            : 'hover:bg-gray-50 text-gray-700'
                      } ${dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : ''} ${isSelected ? '!text-white' : ''}`}>
                      {dayNum}
                      {hasLog && !isSelected && (
                        <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-purple-soft" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* 푸터 */}
              <div className="flex justify-end mt-3 pt-2 border-t border-gray-100">
                <button
                  onClick={() => {
                    setCalYear(new Date().getFullYear())
                    setCalMonth(new Date().getMonth())
                    selectDate(today)
                  }}
                  className="text-xs text-purple-dark font-bold hover:underline">
                  오늘
                </button>
              </div>
            </div>

            {/* 선택 날짜 계획 */}
            <div className={`${card} p-5 space-y-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-700">공부 계획</p>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedDate}</p>
                </div>
                <Link href={`/log`}
                  className="text-xs bg-purple-light text-purple-dark px-3 py-1.5 rounded-full font-bold hover:bg-purple-soft/20 transition-all">
                  {selectedLog ? '수정' : '입력'}
                </Link>
              </div>

              {loadingSelectedLog ? (
                <div className="text-center py-6 text-gray-300 text-sm">불러오는 중...</div>
              ) : !selectedLog ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-3xl">📝</p>
                  <p className="text-sm text-gray-400">이 날은 계획이 없어요</p>
                  {selectedDate === today && (
                    <Link href="/log">
                      <span className="text-xs text-purple-dark font-bold underline underline-offset-2">
                        오늘 계획 입력하러 가기 →
                      </span>
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  {/* 상태 배지 */}
                  {selectedLog.status === 'planned' ? (
                    <div className="bg-gradient-to-r from-yellow-soft to-peach-light rounded-2xl px-4 py-2.5 flex items-center gap-2">
                      <span>⏳</span>
                      <div>
                        <p className="text-xs font-bold text-gray-700">계획 제출 완료</p>
                        <p className="text-xs text-gray-500">관리자 승인 대기 중</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gradient-to-r from-mint-light to-purple-light rounded-2xl px-4 py-2.5 flex items-center gap-2">
                      <span>✅</span>
                      <div>
                        <p className="text-xs font-bold text-purple-dark">승인 완료</p>
                        <p className="text-xs text-purple-dark/60">승인자: {selectedLog.approvedBy}</p>
                      </div>
                    </div>
                  )}

                  {/* 오늘의 기분 + 다짐 */}
                  {(selectedLog.mood || selectedLog.resolution) && (
                    <div className="bg-gray-50 rounded-2xl px-4 py-2.5 flex items-center gap-3">
                      {selectedLog.mood && <span className="text-xl flex-none">{selectedLog.mood}</span>}
                      {selectedLog.resolution && <p className="text-xs font-bold text-gray-600">&ldquo;{selectedLog.resolution}&rdquo;</p>}
                    </div>
                  )}

                  {/* 과목별 계획 */}
                  <div className="space-y-2">
                    {SUBJECTS.map(sub => {
                      const p = selectedLog.plan[sub]
                      const actual = selectedLog.subjects[sub] ?? 0
                      if (!p && !actual) return null
                      return (
                        <div key={sub} className="space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold" style={{ color: SUBJECT_COLORS[sub] }}>
                              {sub}
                            </span>
                            <span className="text-xs text-gray-400">
                              {selectedLog.status === 'approved' && actual > 0
                                ? <span className="text-purple-dark font-bold">{formatMinutes(actual)}</span>
                                : p ? `${formatMinutes(p.plannedMinutes)} 계획` : ''}
                            </span>
                          </div>
                          {p && p.contents.length > 0 && (
                            <div className="flex flex-wrap gap-1 pl-1">
                              {p.contents.map(c => (
                                <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{c}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* 감점 내역 */}
                  {(selectedLog.deductions ?? []).length > 0 && (
                    <div className="bg-gray-50 rounded-2xl p-3 space-y-1">
                      <p className="text-xs font-bold text-pink-dark">감점 내역</p>
                      {(selectedLog.deductions ?? []).map((d, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="font-mono text-gray-400">{d.slot}</span>
                          <span>{d.reason}</span>
                          <span className="text-pink-dark font-bold ml-auto">-{d.minutes}분</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 총 시간 */}
                  <div className="flex justify-between pt-2 border-t border-gray-100 text-xs">
                    <span className="text-gray-400">
                      {selectedLog.status === 'approved' ? '실제 순공' : '계획 합계'}
                    </span>
                    <span className="font-black text-purple-dark">
                      {formatMinutes(selectedLog.status === 'approved' ? selectedLog.totalMinutes : selectedLog.plannedTotalMinutes)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 비밀번호 변경 모달 */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center px-6"
          onClick={() => setShowPasswordModal(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            {pwSuccess ? (
              <div className="text-center space-y-4 py-2">
                <div className="text-4xl">✅</div>
                <p className="text-sm font-bold text-gray-700">비밀번호가 변경됐어요</p>
                <button onClick={() => setShowPasswordModal(false)}
                  className="w-full py-3 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-soft to-pink-soft hover:from-purple-dark hover:to-pink-dark transition-all">
                  닫기
                </button>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-3">
                <p className="text-sm font-bold text-purple-dark">비밀번호 변경</p>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">현재 비밀번호</label>
                  <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-2xl border-2 border-purple-light bg-purple-light/30 focus:border-purple-soft focus:outline-none focus:bg-white transition-all text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">새 비밀번호</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="6자 이상" required
                    className="w-full px-4 py-2.5 rounded-2xl border-2 border-purple-light bg-purple-light/30 focus:border-purple-soft focus:outline-none focus:bg-white transition-all text-sm placeholder:text-gray-300" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">새 비밀번호 확인</label>
                  <input type="password" value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)}
                    placeholder="동일하게 입력" required
                    className="w-full px-4 py-2.5 rounded-2xl border-2 border-purple-light bg-purple-light/30 focus:border-purple-soft focus:outline-none focus:bg-white transition-all text-sm placeholder:text-gray-300" />
                </div>
                {pwError && <div className="bg-pink-light text-pink-dark text-sm rounded-2xl px-4 py-2.5 font-medium">{pwError}</div>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowPasswordModal(false)}
                    className="flex-1 py-3 rounded-2xl font-bold text-purple-dark bg-purple-light hover:bg-purple-soft/30 transition-all">
                    취소
                  </button>
                  <button type="submit" disabled={pwSubmitting}
                    className="flex-1 py-3 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-soft to-pink-soft hover:from-purple-dark hover:to-pink-dark transition-all disabled:opacity-60">
                    {pwSubmitting ? '변경 중...' : '변경하기'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
