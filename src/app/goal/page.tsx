'use client'
// 썸머스쿨 목표 입력 — 성적, 목표대학, 주간 시간표, 학습시간 요약, 가이드 표

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { updateUserTargetGoal } from '@/lib/firestore'
import {
  UNIVERSITY_LINES, UniversityLine,
  GRADE_LEVELS, GradeLevel, GRADE_LEVEL_LABELS,
} from '@/types'
import { STUDY_GUIDE_MINUTES } from '@/lib/studyGuide'
import { formatMinutes } from '@/lib/config'
import {
  ACTIVITIES, ACT_COLORS, STUDY_ACTIVITIES, SCHEDULE_DAYS as DAYS, HOUR_SLOTS,
  colorForActivity, emptySchedule,
} from '@/lib/schedule'
import BottomNav from '@/components/BottomNav'
import LoadingScreen from '@/components/LoadingScreen'

// ── 상수 ──────────────────────────────────────────────
type ActivityType = string

const SUBJS = ['국어', '수학', '영어', '탐구'] as const
const GRADE_TYPES = ['내신', '모의고사'] as const

type GradeMap = Record<string, string>
const emptyGradeMap = (): GradeMap => ({ 국어: '', 수학: '', 영어: '', 탐구: '' })

const DAILY_PRESETS = [120, 180, 240, 300, 360, 480, 600]

// ── 컴포넌트 ──────────────────────────────────────────
export default function GoalPage() {
  const { user, profile, loading, demoMode, refreshProfile } = useAuth()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [gradeLevel, setGradeLevel] = useState<GradeLevel | ''>('')
  const [targetLine, setTargetLine] = useState<UniversityLine | ''>('')
  const [targetUniversity, setTargetUniversity] = useState('')
  const [내신, set내신] = useState<GradeMap>(emptyGradeMap())
  const [모의고사, set모의고사] = useState<GradeMap>(emptyGradeMap())
  const [schedule, setSchedule] = useState<string[][]>(emptySchedule)
  const [dailyMinutes, setDailyMinutes] = useState(300)
  const [weeklyMinutes, setWeeklyMinutes] = useState(1500)
  const [weeklyLocked, setWeeklyLocked] = useState(false)
  const [activeActivity, setActiveActivity] = useState<ActivityType>('자습')
  const [customActivity, setCustomActivity] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (loading) return
    if (demoMode) return
    if (!user || !profile) { router.replace('/login'); return }
    if (profile.role === 'pending') { router.replace('/pending'); return }
    if (profile.role === 'super_admin' || profile.role === 'branch_admin') {
      router.replace('/admin'); return
    }
  }, [loading, user, profile, router, demoMode])

  // 프로필 → 폼 초기화
  useEffect(() => {
    if (!profile) return
    setGradeLevel(profile.gradeLevel ?? '')
    setTargetLine(profile.targetLine ?? '')
    setTargetUniversity(profile.targetUniversity ?? '')
    if (profile.grades) {
      set내신({ 국어: String(profile.grades.내신.국어 ?? ''), 수학: String(profile.grades.내신.수학 ?? ''), 영어: String(profile.grades.내신.영어 ?? ''), 탐구: String(profile.grades.내신.탐구 ?? '') })
      set모의고사({ 국어: String(profile.grades.모의고사.국어 ?? ''), 수학: String(profile.grades.모의고사.수학 ?? ''), 영어: String(profile.grades.모의고사.영어 ?? ''), 탐구: String(profile.grades.모의고사.탐구 ?? '') })
    }
    if (profile.weeklySchedule) setSchedule(profile.weeklySchedule)
    setDailyMinutes(profile.goal?.dailyMinutes ?? 300)
    setWeeklyMinutes(profile.goal?.weeklyMinutes ?? 1500)
  }, [profile])

  // 학년 + 라인 변경 시 권장 시간 자동 제안
  useEffect(() => {
    if (!gradeLevel || !targetLine) return
    const guide = STUDY_GUIDE_MINUTES[targetLine as UniversityLine]?.[gradeLevel as GradeLevel]
    if (!guide) return
    setDailyMinutes(guide)
    if (!weeklyLocked) setWeeklyMinutes(Math.round((guide * 5) / 30) * 30)
  }, [gradeLevel, targetLine, weeklyLocked])

  function handleDailyChange(mins: number) {
    setDailyMinutes(mins)
    if (!weeklyLocked) setWeeklyMinutes(Math.round((mins * 5) / 30) * 30)
  }

  useEffect(() => {
    const up = () => setIsDragging(false)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  // 시간표 셀 → 선택된 활동 유형 칠하기 (기타는 직접 입력한 텍스트로 저장)
  function setCell(si: number, di: number) {
    const value = activeActivity === '기타' ? (customActivity.trim() || '기타') : activeActivity
    setSchedule(prev => {
      if (prev[si][di] === value) return prev
      const next = prev.map(row => [...row])
      next[si][di] = value
      return next
    })
  }

  // 시간표 집계 (식사/기타는 학습시간 합계에서 제외)
  const flat = schedule.flat()
  const actCount = (act: string) => flat.filter(a => a === act).length
  const baewomTotal = ['학교', '학원', '과외', '인강'].reduce((s, a) => s + actCount(a), 0)
  const ikhimTotal = actCount('자습')
  const grandTotal = baewomTotal + ikhimTotal

  const dayTotal = (di: number) => schedule.filter(row => STUDY_ACTIVITIES.includes(row[di])).length

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    setSaveError('')
    try {
      const cleanGrades = (g: GradeMap) => {
        const out: Record<string, number> = {}
        for (const k of Object.keys(g)) {
          const n = parseInt(g[k])
          if (!isNaN(n)) out[k] = n
        }
        return out
      }
      await updateUserTargetGoal(profile.uid, {
        ...(gradeLevel && { gradeLevel }),
        ...(targetLine && { targetLine }),
        ...(targetUniversity.trim() && { targetUniversity: targetUniversity.trim() }),
        grades: {
          내신: cleanGrades(내신),
          모의고사: cleanGrades(모의고사),
        },
        weeklySchedule: schedule,
        goal: { dailyMinutes, weeklyMinutes },
      })
      await refreshProfile()
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2500)
    } catch {
      setSaveError('저장에 실패했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !profile) return <LoadingScreen />

  const guideMinutes = (gradeLevel && targetLine)
    ? STUDY_GUIDE_MINUTES[targetLine as UniversityLine]?.[gradeLevel as GradeLevel]
    : null

  const gradeSetters: Record<string, [GradeMap, (v: GradeMap) => void]> = {
    내신: [내신, set내신],
    모의고사: [모의고사, set모의고사],
  }

  return (
    <div className="min-h-screen pb-28 lg:pb-8 lg:pl-56">
      <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6 space-y-5">

        {/* 헤더 */}
        <div>
          <h1 className="text-xl font-black text-purple-dark">썸머스쿨 목표 입력</h1>
          <p className="text-sm text-gray-400 mt-1">성적, 목표대학, 주간 시간표를 입력하세요</p>
        </div>

        {/* ── 나의 성적 (등급) ── */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-5 shadow-lg shadow-purple-100/30 border border-purple-50 space-y-3">
          <p className="text-sm font-bold text-gray-600">나의 성적 <span className="text-gray-400 font-normal text-xs">(등급 1~9)</span></p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: '280px' }}>
              <thead>
                <tr>
                  <th className="text-left text-gray-400 font-medium py-1.5 pr-3 w-20">구분</th>
                  {SUBJS.map(s => (
                    <th key={s} className="text-center text-gray-500 font-bold py-1.5 px-1">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GRADE_TYPES.map(gtype => {
                  const [map, setMap] = gradeSetters[gtype]
                  return (
                    <tr key={gtype}>
                      <td className="text-gray-500 font-medium py-1.5 pr-3">{gtype}</td>
                      {SUBJS.map(s => (
                        <td key={s} className="px-1 py-1">
                          <input
                            type="number" min={1} max={9}
                            value={map[s]}
                            onChange={e => setMap({ ...map, [s]: e.target.value })}
                            placeholder="─"
                            className="w-full text-center py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-bold text-purple-dark focus:outline-none focus:border-purple-soft placeholder:text-gray-300"
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 목표 대학 ── */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-5 shadow-lg shadow-purple-100/30 border border-purple-50 space-y-4">
          <p className="text-sm font-bold text-gray-600">나의 목표 대학</p>

          {/* 학년 */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-400">학년</p>
            <div className="grid grid-cols-3 gap-2">
              {GRADE_LEVELS.map(g => (
                <button key={g} onClick={() => setGradeLevel(g)}
                  className="py-2.5 rounded-2xl text-sm font-bold transition-all"
                  style={gradeLevel === g
                    ? { background: 'linear-gradient(135deg,#C9B8FF,#FFB3C6)', color: '#fff' }
                    : { background: '#f3f4f6', color: '#9ca3af' }}>
                  {GRADE_LEVEL_LABELS[g]}
                </button>
              ))}
            </div>
          </div>

          {/* 목표 라인 */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-400">목표 대학 라인</p>
            <div className="grid grid-cols-2 gap-2">
              {UNIVERSITY_LINES.map(line => {
                const guide = gradeLevel
                  ? STUDY_GUIDE_MINUTES[line]?.[gradeLevel as GradeLevel]
                  : null
                const selected = targetLine === line
                return (
                  <button key={line} onClick={() => setTargetLine(line)}
                    className="flex flex-col items-start px-3 py-2.5 rounded-2xl text-left transition-all"
                    style={selected
                      ? { background: 'linear-gradient(135deg,#EDE9FF,#FFE4EC)', border: '2px solid #C9B8FF' }
                      : { background: '#f9fafb', border: '2px solid transparent' }}>
                    <span className={`text-xs font-bold ${selected ? 'text-purple-dark' : 'text-gray-600'}`}>{line}</span>
                    {guide && (
                      <span className={`text-xs mt-0.5 ${selected ? 'text-purple-dark/60' : 'text-gray-400'}`}>
                        권장 {guide / 60}h/일
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 권장 시간 배너 */}
          {guideMinutes && (
            <div className="bg-purple-light/40 rounded-2xl px-4 py-2.5 flex items-center gap-2">
              <span className="text-base">💡</span>
              <p className="text-xs font-bold text-purple-dark">
                {GRADE_LEVEL_LABELS[gradeLevel as GradeLevel]} · {targetLine} 권장 하루{' '}
                <span className="text-sm">{guideMinutes / 60}시간</span>
              </p>
            </div>
          )}

          {/* 세부 목표 대학 */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-400">세부 목표 대학 <span className="font-normal text-gray-300">(선택)</span></p>
            <input type="text" placeholder="예: 서울대학교 컴퓨터공학부"
              value={targetUniversity} onChange={e => setTargetUniversity(e.target.value)} maxLength={30}
              className="w-full px-4 py-2.5 rounded-2xl border-2 border-gray-100 bg-gray-50 focus:border-purple-soft focus:outline-none text-sm text-gray-700 placeholder:text-gray-300" />
          </div>
        </div>

        {/* ── 주간 시간표 ── */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-5 shadow-lg shadow-purple-100/30 border border-purple-50 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-600">나의 주간 학습 시간표</p>
            <p className="text-xs text-gray-400">선택 후 드래그</p>
          </div>

          {/* 활동 선택 탭 */}
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITIES.slice(1).map(act => (
              <button key={act}
                onClick={() => setActiveActivity(act as ActivityType)}
                className="text-xs px-2 py-0.5 rounded-full font-bold transition-all select-none"
                style={{
                  backgroundColor: ACT_COLORS[act],
                  color: '#374151',
                  outline: activeActivity === act ? '2px solid #9B85FF' : 'none',
                  outlineOffset: '2px',
                  transform: activeActivity === act ? 'scale(1.08)' : 'scale(1)',
                }}>
                {act}
              </button>
            ))}
            <button
              onClick={() => setActiveActivity('' as ActivityType)}
              className="text-xs px-2 py-0.5 rounded-full font-bold transition-all select-none"
              style={{
                backgroundColor: activeActivity === '' ? '#9B85FF' : '#e5e7eb',
                color: activeActivity === '' ? '#fff' : '#9ca3af',
                outline: activeActivity === '' ? '2px solid #9B85FF' : 'none',
                outlineOffset: '2px',
              }}>
              지우기
            </button>
          </div>

          {/* 기타 직접입력 */}
          {activeActivity === '기타' && (
            <input
              type="text"
              value={customActivity}
              onChange={e => setCustomActivity(e.target.value)}
              placeholder="기타 활동명 입력 (예: 독서, 이동)"
              maxLength={6}
              className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-purple-soft focus:outline-none text-xs text-gray-700 placeholder:text-gray-300"
            />
          )}

          {/* 시간표 테이블 */}
          <div className="overflow-x-auto rounded-2xl border border-gray-100"
            onTouchMove={(e) => {
              if (!isDragging) return
              const touch = e.changedTouches[0]
              const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement
              const td = el?.closest('[data-si]') as HTMLElement | null
              if (td) {
                const tsi = parseInt(td.getAttribute('data-si') ?? '')
                const tdi = parseInt(td.getAttribute('data-di') ?? '')
                if (!isNaN(tsi) && !isNaN(tdi)) setCell(tsi, tdi)
              }
            }}>
            <table className="border-collapse text-xs" style={{ minWidth: '360px', width: '100%' }}>
              <thead>
                <tr className="bg-purple-light/30">
                  <th className="text-left text-gray-500 font-bold px-2 py-1.5 w-16 border-b border-gray-100">시간</th>
                  {DAYS.map(d => (
                    <th key={d} className="text-center text-gray-600 font-bold px-1 py-1.5 border-b border-gray-100">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOUR_SLOTS.map((time, si) => (
                  <tr key={time} className={si % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="text-gray-400 font-mono px-2 py-1 border-b border-gray-50 whitespace-nowrap">
                      {time}
                    </td>
                    {DAYS.map((_, di) => {
                      const act = schedule[si]?.[di] ?? ''
                      return (
                        <td key={di}
                          data-si={si}
                          data-di={di}
                          onPointerDown={() => { setIsDragging(true); setCell(si, di) }}
                          onPointerEnter={() => { if (isDragging) setCell(si, di) }}
                          onTouchStart={() => { setIsDragging(true); setCell(si, di) }}
                          className="text-center px-0.5 py-0.5 border-b border-gray-50 cursor-pointer select-none"
                          style={{
                            backgroundColor: act ? colorForActivity(act) + 'CC' : undefined,
                            touchAction: 'none',
                          }}>
                          <span className="block text-xs font-bold leading-none py-1.5 truncate px-0.5"
                            style={{ color: act ? '#1f2937' : '#d1d5db' }}>
                            {act || '·'}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-purple-light/30">
                  <td className="text-gray-600 font-bold px-2 py-2 text-xs">학습 시간</td>
                  {DAYS.map((_, di) => (
                    <td key={di} className="text-center text-xs font-bold text-purple-dark py-2">
                      {dayTotal(di) > 0 ? `${dayTotal(di)}h` : '─'}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── 나의 학습시간 요약 ── */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-5 shadow-lg shadow-purple-100/30 border border-purple-50 space-y-3">
          <p className="text-sm font-bold text-gray-600">나의 학습시간 <span className="text-gray-400 font-normal text-xs">(주간 합계)</span></p>
          <div className="space-y-2">
            {/* 배움(學) */}
            <div className="bg-blue-50 rounded-2xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-bold text-blue-600">배움(學) — 학교 · 학원 · 과외 · 인강</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {['학교', '학원', '과외', '인강'].map(act => (
                  <div key={act} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block flex-none" style={{ backgroundColor: ACT_COLORS[act] }} />
                      {act}
                    </span>
                    <span className="text-xs font-bold text-gray-700">{actCount(act)}시간/주</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between pt-1 border-t border-blue-100">
                <span className="text-xs font-bold text-blue-600">소계</span>
                <span className="text-xs font-bold text-blue-700">{baewomTotal}시간/주</span>
              </div>
            </div>
            {/* 익힘(習) */}
            <div className="bg-yellow-50 rounded-2xl px-4 py-3 flex items-center justify-between">
              <p className="text-xs font-bold text-yellow-700">
                <span className="w-2.5 h-2.5 rounded-sm inline-block mr-1.5" style={{ backgroundColor: ACT_COLORS['자습'] }} />
                익힘(習) — 자습
              </p>
              <span className="text-xs font-bold text-yellow-800">{ikhimTotal}시간/주</span>
            </div>
            {/* 합계 */}
            <div className="bg-purple-light/40 rounded-2xl px-4 py-3 flex items-center justify-between">
              <p className="text-sm font-black text-purple-dark">주간 합계</p>
              <p className="text-xl font-black text-purple-dark">{grandTotal}시간</p>
            </div>
          </div>
        </div>

        {/* ── 목표대학별 1일 학습시간 가이드 ── */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-5 shadow-lg shadow-purple-100/30 border border-purple-50 space-y-3">
          <p className="text-sm font-bold text-gray-600">목표대학별 1일 학습시간 가이드</p>
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full text-xs border-collapse" style={{ minWidth: '280px' }}>
              <thead>
                <tr className="bg-purple-light/30">
                  <th className="text-left text-gray-500 font-bold px-3 py-2 border-b border-gray-100">대학 라인</th>
                  {GRADE_LEVELS.map(g => (
                    <th key={g} className="text-center text-gray-500 font-bold px-2 py-2 border-b border-gray-100">
                      {GRADE_LEVEL_LABELS[g]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {UNIVERSITY_LINES.map((line, i) => {
                  const isSelected = line === targetLine
                  return (
                    <tr key={line}
                      style={isSelected ? { backgroundColor: '#EDE9FF' } : { backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td className="px-3 py-2 font-medium border-b border-gray-50"
                        style={{ color: isSelected ? '#9B85FF' : '#374151', fontWeight: isSelected ? 700 : 400 }}>
                        {line}
                      </td>
                      {GRADE_LEVELS.map(g => {
                        const h = STUDY_GUIDE_MINUTES[line][g] / 60
                        const isMe = isSelected && gradeLevel === g
                        return (
                          <td key={g} className="text-center px-2 py-2 border-b border-gray-50">
                            <span className={`font-bold ${isMe ? 'text-purple-dark text-sm' : 'text-gray-600'}`}>
                              {h}h
                            </span>
                            {isMe && <span className="ml-1">👈</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">+자습, 인강, 학원, 숙제 다 포함한 시간</p>
        </div>

        {/* ── 목표 시간 설정 ── */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-5 shadow-lg shadow-purple-100/30 border border-purple-50 space-y-4">
          <p className="text-sm font-bold text-gray-600">목표 순공시간 설정</p>

          {/* 하루 목표 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500">하루 목표</p>
              <p className="text-base font-black text-purple-dark">{formatMinutes(dailyMinutes)}</p>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {DAILY_PRESETS.map(p => (
                <button key={p} onClick={() => handleDailyChange(p)}
                  className="py-2 rounded-xl text-xs font-bold transition-all"
                  style={dailyMinutes === p
                    ? { background: '#C9B8FF', color: '#fff' }
                    : { background: '#f3f4f6', color: '#6b7280' }}>
                  {p / 60}h
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min={30} max={900} step={30} value={dailyMinutes}
                onChange={e => handleDailyChange(Number(e.target.value) || 0)}
                className="flex-1 px-3 py-2 rounded-xl border-2 border-gray-100 bg-gray-50 focus:outline-none text-sm font-bold text-center text-gray-700" />
              <span className="text-xs text-gray-400">분 직접입력</span>
            </div>
          </div>

          {/* 주간 목표 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-500">주간 목표</p>
                {!weeklyLocked && <p className="text-xs text-gray-300">하루 × 5 자동</p>}
              </div>
              <p className="text-base font-black text-purple-dark">{formatMinutes(weeklyMinutes)}</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min={60} max={5040} step={30} value={weeklyMinutes}
                onChange={e => { setWeeklyMinutes(Number(e.target.value) || 0); setWeeklyLocked(true) }}
                className="flex-1 px-3 py-2 rounded-xl border-2 border-gray-100 bg-gray-50 focus:outline-none text-sm font-bold text-center text-gray-700" />
              <span className="text-xs text-gray-400">분 직접입력</span>
            </div>
            {weeklyLocked && (
              <button onClick={() => { setWeeklyLocked(false); setWeeklyMinutes(Math.round((dailyMinutes * 5) / 30) * 30) }}
                className="text-xs text-purple-dark/60 underline underline-offset-2">
                자동 계산으로 되돌리기
              </button>
            )}
            <div className="bg-purple-light/30 rounded-2xl px-4 py-2 flex justify-between">
              <span className="text-xs text-gray-500">4주 누적 목표</span>
              <span className="text-sm font-black text-purple-dark">{formatMinutes(weeklyMinutes * 4)}</span>
            </div>
          </div>
        </div>

        {/* 저장 버튼 */}
        <button onClick={handleSave} disabled={saving}
          className="w-full py-5 rounded-3xl font-black text-white text-base bg-gradient-to-r from-purple-soft to-pink-soft hover:from-purple-dark hover:to-pink-dark transition-all shadow-xl shadow-purple-200/50 disabled:opacity-60">
          {saving ? '저장 중...' : savedMsg ? '✅ 저장 완료!' : '목표 저장하기'}
        </button>
        {savedMsg && (
          <p className="text-center text-xs text-purple-dark font-bold">
            목표가 업데이트됐어요. 홈에서 달성 현황을 확인해봐요. 🎯
          </p>
        )}
        {saveError && (
          <p className="text-center text-xs text-pink-dark font-bold">{saveError}</p>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
