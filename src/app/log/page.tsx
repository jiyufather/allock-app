'use client'
// 오늘 공부 계획 입력 — 왼쪽: 할 일 목록, 오른쪽: 시간표(항목 단위 배치, 분 합산)

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { submitStudyPlan, getLogForDate } from '@/lib/firestore'
import { SUBJECTS, SUBJECT_COLORS, Subject, StudyLog, StudyPlan, Deduction } from '@/types'
import { toDateStr, formatMinutes, isWithinSummerSchool } from '@/lib/config'
import BottomNav from '@/components/BottomNav'
import LoadingScreen from '@/components/LoadingScreen'

const SUBJECT_EMOJI: Record<Subject, string> = {
  국어: '📖', 수학: '📐', 영어: '🔤', 탐구: '🔬', 기타: '✨',
}

const MOODS = ['😆', '😊', '😐', '😔', '😫'] as const

// 06:00 ~ 23:30, 30분 간격 (36 슬롯)
const TIME_SLOTS = Array.from({ length: 36 }, (_, i) => {
  const h = Math.floor((6 * 60 + i * 30) / 60)
  const m = (6 * 60 + i * 30) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

// 할 일 항목 타입
type StudyEntry = { id: number; subject: Subject; content: string; minutes: number }

// 시간표: 슬롯 키 → entry.id (null = 비어있음)
type Timetable = Record<string, number | null>

const emptyTimetable = (): Timetable =>
  Object.fromEntries(TIME_SLOTS.map(t => [t, null]))

/** 항목별 시간표 슬롯 수 × 30분, 슬롯 없으면 entry.minutes 사용 */
function calcEntryMins(entry: StudyEntry, tt: Timetable): number {
  const slots = Object.values(tt).filter(id => id === entry.id).length
  return slots > 0 ? slots * 30 : entry.minutes
}

/** entries + timetable → Firestore 저장용 plan */
function buildPlan(entries: StudyEntry[], tt: Timetable): Partial<Record<Subject, StudyPlan>> {
  const plan: Partial<Record<Subject, StudyPlan>> = {}
  for (const sub of SUBJECTS) {
    const subEntries = entries.filter(e => e.subject === sub)
    const totalMins = subEntries.reduce((s, e) => s + calcEntryMins(e, tt), 0)
    if (totalMins > 0) {
      const contents = subEntries.map(e => e.content).filter(Boolean)
      plan[sub] = { contents: contents.length > 0 ? contents : [sub], plannedMinutes: totalMins }
    }
  }
  return plan
}

/** entries + timetable → 시간 슬롯별 과목 배치 (시간대별 감점용) */
function buildScheduleSlots(entries: StudyEntry[], tt: Timetable): Partial<Record<string, Subject>> {
  const slots: Partial<Record<string, Subject>> = {}
  for (const [time, entryId] of Object.entries(tt)) {
    if (entryId == null) continue
    const entry = entries.find(e => e.id === entryId)
    if (entry) slots[time] = entry.subject
  }
  return slots
}

/** 감점 내역 읽기전용 표시 */
function DeductionList({ deductions }: { deductions: Deduction[] }) {
  if (deductions.length === 0) return null
  return (
    <div className="bg-white/60 rounded-2xl p-2.5 space-y-1">
      <p className="text-xs font-bold text-pink-dark">감점 내역</p>
      {deductions.map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-mono text-gray-400">{d.slot}</span>
          <span>{d.reason}</span>
          <span className="text-pink-dark font-bold ml-auto">-{d.minutes}분</span>
        </div>
      ))}
    </div>
  )
}

/** 기존 로그 → 편집 상태로 변환 */
function logToState(log: StudyLog): { entries: StudyEntry[]; tt: Timetable } {
  const entries: StudyEntry[] = []
  let id = 0
  for (const sub of SUBJECTS) {
    const p = log.plan[sub]
    if (p && p.plannedMinutes > 0) {
      const cnt = Math.max(1, p.contents.length)
      const minsEach = Math.max(10, Math.round(p.plannedMinutes / cnt / 10) * 10)
      for (const content of (p.contents.length > 0 ? p.contents : [sub])) {
        entries.push({ id: id++, subject: sub, content, minutes: minsEach })
      }
    }
  }
  return { entries, tt: emptyTimetable() }
}

export default function LogPage() {
  const { user, profile, loading, demoMode } = useAuth()
  const router = useRouter()
  const nextId = useRef(0)

  const [date, setDate] = useState(toDateStr(new Date()))
  const [entries, setEntries] = useState<StudyEntry[]>([])
  const [timetable, setTimetable] = useState<Timetable>(emptyTimetable)
  const [mood, setMood] = useState('')
  const [resolution, setResolution] = useState('')
  const [existing, setExisting] = useState<StudyLog | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loadingLog, setLoadingLog] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })

  // 추가 폼 상태
  const [formSubject, setFormSubject] = useState<Subject>('국어')
  const [formContent, setFormContent] = useState('')
  const [formMinutes, setFormMinutes] = useState('')

  useEffect(() => {
    if (loading) return
    if (demoMode) return
    if (!user || !profile) { router.replace('/login'); return }
    if (profile.role === 'pending') { router.replace('/pending'); return }
  }, [loading, user, profile, router, demoMode])

  useEffect(() => {
    if (!profile || (!demoMode && !user)) return
    setLoadingLog(true)
    setSaved(false)
    setEditMode(false)
    setOpenSlot(null)
    setEntries([])
    setTimetable(emptyTimetable())
    setMood('')
    setResolution('')
    getLogForDate(profile.uid, date).then(log => {
      setExisting(log)
      if (log) {
        const { entries: e, tt } = logToState(log)
        setEntries(e)
        setTimetable(tt)
        setMood(log.mood ?? '')
        setResolution(log.resolution ?? '')
      }
      setLoadingLog(false)
    })
  }, [profile, date, demoMode])

  // ── 집계 ─────────────────────────────────────
  const entrySlots = (entryId: number) =>
    Object.values(timetable).filter(id => id === entryId).length

  const subTotal = (sub: Subject) =>
    entries.filter(e => e.subject === sub)
      .reduce((s, e) => s + calcEntryMins(e, timetable), 0)

  const hasAnyPlan = SUBJECTS.some(sub => subTotal(sub) > 0)
  const totalPlanned = SUBJECTS.reduce((s, sub) => s + subTotal(sub), 0)
  const isValid = demoMode || isWithinSummerSchool(date, profile ?? undefined)

  // ── 액션 ─────────────────────────────────────
  function addEntry() {
    const content = formContent.trim()
    const mins = parseInt(formMinutes) || 0
    if (!content && mins === 0) return
    setEntries(prev => [...prev, { id: nextId.current++, subject: formSubject, content, minutes: mins }])
    setFormContent('')
    setFormMinutes('')
  }

  function removeEntry(id: number) {
    setEntries(prev => prev.filter(e => e.id !== id))
    // 해당 항목의 시간표 슬롯도 초기화
    setTimetable(prev => {
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        if (next[k] === id) next[k] = null
      }
      return next
    })
  }

  /** 슬롯 클릭 → 드롭다운 열기 */
  function handleSlotClick(time: string, e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (entries.length === 0) return
    if (openSlot === time) { setOpenSlot(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    const dropH = (entries.length + 1) * 36
    const above = rect.bottom + dropH > window.innerHeight - 16
    setDropdownPos({
      top: above ? rect.top - dropH - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
    setOpenSlot(time)
  }

  /** 드롭다운에서 항목 선택 → 슬롯에 배치 */
  function assignSlot(entryId: number | null) {
    if (!openSlot) return
    setTimetable(prev => ({ ...prev, [openSlot]: entryId }))
    setOpenSlot(null)
  }

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const close = () => setOpenSlot(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  async function handleSave() {
    if (!profile || !isValid || !hasAnyPlan) return
    setSaving(true)
    try {
      await submitStudyPlan(profile.uid, profile.name, profile.school, date, buildPlan(entries, timetable), buildScheduleSlots(entries, timetable), mood, resolution.trim(), profile.summerStart)
      setSaved(true)
      setEditMode(false)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !profile) return <LoadingScreen />

  const isApproved = existing?.status === 'approved'
  const isPending = existing?.status === 'planned'
  const showForm = !isApproved && (!isPending || editMode || saved)

  return (
    <div className="min-h-screen pb-24 lg:pb-0 lg:pl-56">
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-black text-purple-dark">오늘 공부 계획</h1>
          <p className="text-sm text-gray-400 mt-1">세션 시작 전에 과목별 계획을 입력하세요</p>
        </div>

        {/* 날짜 선택 */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-4 shadow-lg shadow-purple-100/30 border border-purple-50">
          <label className="text-xs font-bold text-gray-500 block mb-2">날짜 선택</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full px-4 py-2.5 rounded-2xl border-2 border-purple-light bg-purple-light/30 focus:border-purple-soft focus:outline-none text-sm font-medium text-purple-dark" />
          {!isValid && date && (
            <p className="text-xs text-pink-dark mt-2 font-medium">썸머스쿨 기간 외의 날짜예요.</p>
          )}
        </div>

        {/* 승인 완료 */}
        {isApproved && (
          <div className="bg-gradient-to-r from-mint-light to-purple-light rounded-3xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-bold text-purple-dark">관리자 승인 완료</p>
                <p className="text-xs text-gray-500">승인자: {existing.approvedBy}</p>
              </div>
            </div>
            {(existing.mood || existing.resolution) && (
              <div className="bg-white/60 rounded-2xl px-4 py-3 flex items-center gap-3">
                {existing.mood && <span className="text-2xl flex-none">{existing.mood}</span>}
                {existing.resolution && <p className="text-sm font-bold text-purple-dark">&ldquo;{existing.resolution}&rdquo;</p>}
              </div>
            )}
            <div className="space-y-2">
              {SUBJECTS.map(sub => {
                const actual = existing.subjects[sub] ?? 0
                const p = existing.plan[sub]
                if (!actual && !p) return null
                return (
                  <div key={sub} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold text-gray-600">{SUBJECT_EMOJI[sub]} {sub}</span>
                      <span className="font-bold text-purple-dark">{formatMinutes(actual)}</span>
                    </div>
                    {p && p.contents.length > 0 && (
                      <div className="flex flex-wrap gap-1 pl-6">
                        {p.contents.map(c => (
                          <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-white/60 text-gray-500">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <DeductionList deductions={existing.deductions ?? []} />
            <p className="text-sm font-black text-purple-dark text-right">총 {formatMinutes(existing.totalMinutes)}</p>
          </div>
        )}

        {/* 승인 대기 */}
        {(isPending || saved) && !isApproved && !editMode && (
          <div className="bg-gradient-to-r from-yellow-soft to-peach-light rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⏳</span>
                <div>
                  <p className="font-bold text-gray-700">계획 제출 완료</p>
                  <p className="text-xs text-gray-500">관리자 승인 대기 중</p>
                </div>
              </div>
              <button onClick={() => setEditMode(true)}
                className="text-xs bg-white/60 text-gray-600 px-3 py-1.5 rounded-full font-bold hover:bg-white/80 transition-all">
                수정하기
              </button>
            </div>
            {((existing?.mood || mood) || (existing?.resolution || resolution)) && (
              <div className="bg-white/60 rounded-2xl px-4 py-3 flex items-center gap-3">
                {(existing?.mood || mood) && <span className="text-2xl flex-none">{existing?.mood || mood}</span>}
                {(existing?.resolution || resolution) && <p className="text-sm font-bold text-gray-700">&ldquo;{existing?.resolution || resolution}&rdquo;</p>}
              </div>
            )}
            <div className="space-y-2">
              {SUBJECTS.map(sub => {
                const p = existing?.plan[sub] ?? (saved ? buildPlan(entries, timetable)[sub] : null)
                if (!p) return null
                return (
                  <div key={sub} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span className="font-bold">{SUBJECT_EMOJI[sub]} {sub}</span>
                      <span>{formatMinutes(p.plannedMinutes)} 계획</span>
                    </div>
                    {p.contents.length > 0 && (
                      <div className="flex flex-wrap gap-1 pl-5">
                        {p.contents.map(c => (
                          <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-white/60 text-gray-500">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <DeductionList deductions={existing?.deductions ?? []} />
          </div>
        )}

        {/* ── 계획 입력 폼 ── */}
        {!loadingLog && showForm && !isApproved && (
          <>
            {editMode && (
              <p className="text-xs text-center text-orange-400 font-medium">⚠️ 수정 후 다시 제출하면 기존 계획이 업데이트돼요</p>
            )}

            {/* 오늘의 기분 + 다짐 */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-4 shadow-lg shadow-purple-100/30 border border-purple-50 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500">오늘의 기분</label>
                <div className="flex gap-2">
                  {MOODS.map(m => (
                    <button key={m} type="button" onClick={() => setMood(m)}
                      className="flex-1 text-2xl py-2 rounded-2xl transition-all"
                      style={mood === m
                        ? { background: 'linear-gradient(135deg, #C9B8FF, #FFB3C6)', transform: 'scale(1.08)' }
                        : { backgroundColor: '#f3f4f6' }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500">오늘의 다짐 한마디</label>
                <input value={resolution} onChange={e => setResolution(e.target.value)}
                  placeholder="예: 끝까지 집중하자!" maxLength={40}
                  className="w-full px-3 py-2.5 rounded-2xl border-2 border-purple-light bg-purple-light/30 focus:border-purple-soft focus:outline-none focus:bg-white transition-all text-sm placeholder:text-gray-300" />
              </div>
            </div>

            {/* 좌우 분할 패널 (모바일: 위아래로 쌓임) */}
            <div className="flex flex-col lg:flex-row gap-2 lg:h-[600px]">

              {/* ──────── 왼쪽: 할 일 목록 ──────── */}
              <div className="flex flex-col gap-2 w-full lg:w-[44%] h-[260px] lg:h-auto">

                {/* 추가 폼 */}
                <div className="bg-white/90 rounded-2xl p-3 shadow-md shadow-purple-100/20 border border-purple-50 space-y-2.5 flex-none">
                  <p className="text-xs font-bold text-gray-400">할 일 추가</p>
                  <div className="flex flex-wrap gap-1">
                    {SUBJECTS.map(sub => (
                      <button key={sub} onClick={() => setFormSubject(sub)}
                        className="px-2 py-0.5 rounded-full text-xs font-bold transition-all"
                        style={formSubject === sub
                          ? { backgroundColor: SUBJECT_COLORS[sub], color: '#fff' }
                          : { backgroundColor: '#f3f4f6', color: '#9ca3af' }}>
                        {SUBJECT_EMOJI[sub]}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs font-bold" style={{ color: SUBJECT_COLORS[formSubject] }}>
                    {SUBJECT_EMOJI[formSubject]} {formSubject}
                  </p>
                  <input value={formContent} onChange={e => setFormContent(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addEntry()}
                    placeholder="학습 내용 (예: 미적분)" maxLength={20}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-700 placeholder:text-gray-300 focus:outline-none" />
                  <div className="flex gap-1">
                    <input value={formMinutes} onChange={e => setFormMinutes(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addEntry()}
                      type="number" min="10" max="480" step="10" placeholder="분"
                      className="flex-1 px-2 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-xs text-center font-bold text-gray-700 focus:outline-none" />
                    <button onClick={addEntry}
                      className="px-3 py-1.5 rounded-xl text-white text-xs font-bold"
                      style={{ backgroundColor: SUBJECT_COLORS[formSubject] }}>
                      추가
                    </button>
                  </div>
                </div>

                {/* 항목 목록 — 분 합산 */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                  {entries.length === 0 && (
                    <p className="text-xs text-gray-300 text-center py-6">공부할 내용을<br/>추가해봐요</p>
                  )}
                  {SUBJECTS.filter(sub => entries.some(e => e.subject === sub)).map(sub => {
                    const subEntries = entries.filter(e => e.subject === sub)
                    const total = subTotal(sub)
                    return (
                      <div key={sub} className="bg-white/80 rounded-2xl p-2.5 shadow-sm border border-purple-50/60 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold" style={{ color: SUBJECT_COLORS[sub] }}>
                            {SUBJECT_EMOJI[sub]} {sub}
                          </span>
                          <span className="text-xs font-black text-purple-dark">{formatMinutes(total)}</span>
                        </div>
                        {subEntries.map(entry => {
                          const slots = entrySlots(entry.id)
                          const mins = calcEntryMins(entry, timetable)
                          return (
                            <div key={entry.id} className="flex items-center gap-1 pl-1.5">
                              <div className="w-1 h-1 rounded-full flex-none"
                                style={{ backgroundColor: SUBJECT_COLORS[sub] + '80' }} />
                              <span className="flex-1 text-xs text-gray-600 truncate">
                                {entry.content || '─'}
                              </span>
                              <span className="text-xs text-gray-400 whitespace-nowrap">
                                {slots > 0
                                  ? <span className="text-purple-dark font-bold">🗓️×{slots} ({formatMinutes(mins)})</span>
                                  : mins > 0 ? `${mins}분` : ''}
                              </span>
                              <button onClick={() => removeEntry(entry.id)}
                                className="text-gray-300 hover:text-red-400 text-xs flex-none ml-0.5">✕</button>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ──────── 오른쪽: 시간표 ──────── */}
              <div className="flex flex-col w-full lg:flex-1 h-[340px] lg:h-auto bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg shadow-purple-100/20 border border-purple-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100 flex-none">
                  <p className="text-xs font-bold text-gray-500">⏰ 시간표</p>
                  <p className="text-xs text-gray-300 mt-0.5">
                    {entries.length > 0 ? '슬롯 클릭 → 항목 선택' : '← 먼저 할 일 추가'}
                  </p>
                </div>

                {/* 범례 */}
                {entries.length > 0 && (
                  <div className="px-2 py-1.5 border-b border-gray-50 flex flex-wrap gap-1 flex-none">
                    {entries.map(entry => (
                      <span key={entry.id}
                        className="text-xs px-1.5 py-0.5 rounded-full text-white font-bold truncate max-w-[80px]"
                        style={{ backgroundColor: SUBJECT_COLORS[entry.subject] }}
                        title={`${entry.subject}: ${entry.content}`}>
                        {entry.content ? entry.content.slice(0, 5) : SUBJECT_EMOJI[entry.subject]}
                      </span>
                    ))}
                  </div>
                )}

                {/* 슬롯 목록 */}
                <div className="flex-1 overflow-y-auto">
                  {TIME_SLOTS.map((time, i) => {
                    const slotId = timetable[time]
                    const slotEntry = slotId != null ? entries.find(e => e.id === slotId) : null
                    const color = slotEntry ? SUBJECT_COLORS[slotEntry.subject] : undefined
                    const isHour = i % 2 === 0
                    return (
                      <button key={time} onClick={(e) => handleSlotClick(time, e)}
                        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left transition-all active:scale-[0.98]"
                        style={{
                          backgroundColor: openSlot === time ? '#EDE9FF' : slotEntry ? color + '18' : 'transparent',
                          borderTop: isHour && i > 0 ? '1px solid #f3f4f6' : undefined,
                          minHeight: '34px',
                          cursor: entries.length === 0 ? 'default' : 'pointer',
                        }}>
                        {/* 시각 */}
                        <span className={`font-mono text-xs flex-none w-9 ${isHour ? 'font-bold text-gray-500' : 'text-gray-300'}`}>
                          {isHour ? time : `:${time.slice(3)}`}
                        </span>
                        {/* 항목 블록 */}
                        {slotEntry ? (
                          <span className="flex-1 text-xs font-bold px-2 py-0.5 rounded-full text-white truncate"
                            style={{ backgroundColor: color }}>
                            {SUBJECT_EMOJI[slotEntry.subject]} {slotEntry.content || slotEntry.subject}
                          </span>
                        ) : (
                          <span className="flex-1 border-b border-dashed border-gray-100 h-3" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* 합계 + 제출 */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-5 shadow-xl shadow-purple-100/30 border border-purple-50 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-600">총 계획 시간</p>
                <p className="text-2xl font-black text-purple-dark">{formatMinutes(totalPlanned)}</p>
              </div>
              <div className="flex gap-2">
                {editMode && (
                  <button
                    onClick={() => {
                      setEditMode(false)
                      if (existing) {
                        const { entries: e, tt } = logToState(existing)
                        setEntries(e)
                        setTimetable(tt)
                        setMood(existing.mood ?? '')
                        setResolution(existing.resolution ?? '')
                      }
                    }}
                    className="flex-1 py-4 rounded-2xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all text-sm">
                    취소
                  </button>
                )}
                <button onClick={handleSave} disabled={saving || !hasAnyPlan || !isValid}
                  className="flex-1 py-4 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-soft to-pink-soft hover:from-purple-dark hover:to-pink-dark transition-all shadow-lg shadow-purple-200/50 disabled:opacity-50 text-sm">
                  {saving ? '제출 중...' : editMode ? '수정 완료' : !hasAnyPlan ? '계획을 입력해주세요' : '계획 제출하기'}
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center">관리자가 세션 종료 후 실제 시간을 확인하고 승인해요</p>
            </div>
          </>
        )}

        {loadingLog && <div className="text-center py-8 text-gray-300">불러오는 중...</div>}
      </div>

      {/* 슬롯 드롭다운 */}
      {openSlot && entries.length > 0 && (
        <div
          className="fixed z-50 bg-white rounded-2xl shadow-xl border border-purple-100 overflow-hidden py-1"
          style={{ top: dropdownPos.top, left: dropdownPos.left, minWidth: Math.max(dropdownPos.width, 160) }}
          onClick={e => e.stopPropagation()}>
          {/* 비우기 */}
          <button
            onClick={() => assignSlot(null)}
            className="w-full px-3 py-2 text-left text-xs text-gray-400 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-200 flex-none" />
            비우기
            {timetable[openSlot] === null && <span className="ml-auto text-purple-soft">✓</span>}
          </button>
          {/* 항목 목록 */}
          {entries.map(entry => (
            <button key={entry.id}
              onClick={() => assignSlot(entry.id)}
              className="w-full px-3 py-2 text-left text-xs font-bold hover:bg-gray-50 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-none"
                style={{ backgroundColor: SUBJECT_COLORS[entry.subject] }} />
              <span style={{ color: SUBJECT_COLORS[entry.subject] }}>
                {SUBJECT_EMOJI[entry.subject]} {entry.content || entry.subject}
              </span>
              {timetable[openSlot] === entry.id && <span className="ml-auto text-purple-soft">✓</span>}
            </button>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  )
}
