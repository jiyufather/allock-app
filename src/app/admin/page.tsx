'use client'
// 관리자 대시보드 — 학생 승인, 학습 관리(계획 승인), 랭킹 현황

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import {
  getAllStudents, getAllLogs,
  buildRankings, BranchRanking, StudentRanking,
  getPendingApprovals, approveStudyLog, addDeduction,
  updateStudentSummerDates, bulkSetSummerDates,
  getStudentCodes, addStudentCode, deleteStudentCode, bulkAddStudentCodes, bulkDeleteStudentCodes,
  getLockStudySchedule, saveLockStudySchedule, getLockStudySupervisors, saveLockStudySupervisors,
} from '@/lib/firestore'
import { exportBranchDetailXlsx, parseBranchCodesFromXlsx } from '@/lib/exportExcel'
import {
  LOCK_STUDY_DAYS, LOCK_STUDY_SLOTS, LOCK_STUDY_ACTIVITIES, LOCK_CUSTOM_ACTIVITIES,
  LOCK_ACT_COLORS, lockColorFor,
} from '@/lib/lockStudy'
import { DEDUCTION_REASONS, computeNetSubjects, slotRange } from '@/lib/deductions'
import { BRANCHES } from '@/lib/branches'
import { fromLoginEmail } from '@/lib/auth'
import { UserProfile, StudyLog, SUBJECTS, Subject, SUBJECT_COLORS, GRADE_LEVEL_LABELS, StudentCode } from '@/types'
import { formatMinutes, toDateStr, getEffectiveSummerDates } from '@/lib/config'
import LoadingScreen from '@/components/LoadingScreen'

type Tab = 'study' | 'ranking' | 'top10' | 'schedule' | 'lockstudy' | 'branch' | 'codes'

export default function AdminPage() {
  const { user, profile, loading, demoMode } = useAuth()
  const router = useRouter()
  const isBranch = profile?.role === 'branch_admin'
  const mySchool = isBranch ? profile?.school : undefined

  const [tab, setTab] = useState<Tab>('study')
  const [branchRanking, setBranchRanking] = useState<BranchRanking[]>([])
  const [studentRanking, setStudentRanking] = useState<StudentRanking[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [allStudents, setAllStudents] = useState<UserProfile[]>([])

  // 지점 세부정보 / 학생코드 탭 상태
  const [allLogs, setAllLogs] = useState<StudyLog[]>([])
  const [studentCodes, setStudentCodes] = useState<StudentCode[]>([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newCodeBranch, setNewCodeBranch] = useState('')
  const [addingCode, setAddingCode] = useState(false)
  const [deletingCode, setDeletingCode] = useState<string | null>(null)
  const [codesLoading, setCodesLoading] = useState(false)
  const [resettingUid, setResettingUid] = useState<string | null>(null)
  const [resetSentUid, setResetSentUid] = useState<string | null>(null)
  const [resetResult, setResetResult] = useState<{ name: string; password: string } | null>(null)
  const [copiedPw, setCopiedPw] = useState(false)
  const [codeSearch, setCodeSearch] = useState('')
  const [codeBranchFilter, setCodeBranchFilter] = useState('')
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // 락스터디 관리 탭 상태
  const [lockStudyDay, setLockStudyDay] = useState('월')
  const [lockEntries, setLockEntries] = useState<Record<string, string[]>>({})
  const [lockActiveActivity, setLockActiveActivity] = useState<string>('입실')
  const [lockCustomText, setLockCustomText] = useState('')
  const [lockSupervisors, setLockSupervisors] = useState<Record<string, string>>({})
  const [lockLoading, setLockLoading] = useState(false)
  const [lockSaving, setLockSaving] = useState(false)
  const [lockDragging, setLockDragging] = useState(false)
  const lockBranch = isBranch ? mySchool : selectedBranch

  // 기간 설정 탭 상태
  const [bulkStart, setBulkStart] = useState(toDateStr(new Date()))
  const [bulkEnd, setBulkEnd] = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [savingUid, setSavingUid] = useState<string | null>(null)

  // 학습 관리 탭 상태
  const [studyDate, setStudyDate] = useState(toDateStr(new Date()))
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>([])
  const [studyLoading, setStudyLoading] = useState(false)
  const [actualMins, setActualMins] = useState<Record<string, Record<Subject, string>>>({})
  const [approvingLog, setApprovingLog] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Record<string, string | null>>({})
  const [deductReason, setDeductReason] = useState<Record<string, string>>({})
  const [deductCustom, setDeductCustom] = useState<Record<string, string>>({})
  const [deductMinutes, setDeductMinutes] = useState<Record<string, string>>({})
  const [addingDeduction, setAddingDeduction] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (demoMode) return
    if (!user || !profile) { router.replace('/login'); return }
    if (profile.role === 'student' || profile.role === 'pending') {
      router.replace(profile.role === 'pending' ? '/pending' : '/dashboard')
      return
    }
  }, [loading, user, profile, router, demoMode])

  async function loadData() {
    const [students, logs] = await Promise.all([
      getAllStudents(mySchool),
      getAllLogs(mySchool),
    ])
    setAllStudents(students.filter(u => u.role === 'student'))
    setAllLogs(logs)
    const { studentRanking, branchRanking } = buildRankings(logs, students)
    setBranchRanking(branchRanking)
    setStudentRanking(studentRanking.slice(0, 10))
    setDataLoading(false)
  }

  useEffect(() => {
    if (!profile) return
    if (!demoMode && !user) return
    if (profile.role !== 'super_admin' && profile.role !== 'branch_admin') return
    loadData()
  }, [user, profile, demoMode])

  async function loadStudyLogs() {
    setStudyLoading(true)
    const logs = await getPendingApprovals(studyDate, mySchool)
    setStudyLogs(logs.sort((a, b) => {
      if (a.status === 'planned' && b.status !== 'planned') return -1
      if (a.status !== 'planned' && b.status === 'planned') return 1
      return a.userName.localeCompare(b.userName)
    }))
    // 기본값 세팅: 계획 시간 그대로
    const defaults: Record<string, Record<Subject, string>> = {}
    for (const log of logs) {
      if (log.status === 'planned') {
        defaults[log.id] = {} as Record<Subject, string>
        for (const sub of SUBJECTS) {
          defaults[log.id][sub] = String(log.plan[sub]?.plannedMinutes ?? 0)
        }
      }
    }
    setActualMins(defaults)
    setStudyLoading(false)
  }

  useEffect(() => {
    if (tab !== 'study' || !profile) return
    loadStudyLogs()
  }, [tab, studyDate, profile])

  useEffect(() => {
    if (tab !== 'codes' && tab !== 'branch') return
    if (tab === 'codes' && isBranch) return // 학생코드 관리는 super_admin 전용
    setCodesLoading(true)
    getStudentCodes().then(codes => {
      setStudentCodes(codes)
      setCodesLoading(false)
    })
  }, [tab, isBranch])

  useEffect(() => {
    if (tab !== 'lockstudy' || !lockBranch) return
    setLockLoading(true)
    getLockStudySchedule(lockBranch, lockStudyDay).then(sched => {
      setLockEntries(sched?.entries ?? {})
      setLockLoading(false)
    })
  }, [tab, lockStudyDay, lockBranch])

  useEffect(() => {
    if (tab !== 'lockstudy' || !lockBranch) return
    getLockStudySupervisors(lockBranch).then(sup => {
      setLockSupervisors(sup?.byDay ?? {})
    })
  }, [tab, lockBranch])

  useEffect(() => {
    const up = () => setLockDragging(false)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  function hasScheduleSlots(log: StudyLog) {
    return !!log.scheduleSlots && Object.keys(log.scheduleSlots).length > 0
  }

  async function approveLog(log: StudyLog) {
    setApprovingLog(log.id)
    let actual: Partial<Record<Subject, number>>
    if (hasScheduleSlots(log)) {
      actual = computeNetSubjects(log.scheduleSlots, log.deductions)
    } else {
      const mins = actualMins[log.id] ?? {}
      actual = {}
      for (const sub of SUBJECTS) {
        const v = parseInt(mins[sub]) || 0
        if (v > 0) actual[sub] = v
      }
    }
    await approveStudyLog(log.id, actual, profile!.name)
    // 데모 모드: 로컬 상태 낙관적 업데이트
    setStudyLogs(prev => prev.map(l =>
      l.id === log.id ? { ...l, status: 'approved', subjects: actual, totalMinutes: Object.values(actual).reduce((s, v) => s + (v ?? 0), 0), approvedBy: profile!.name } : l
    ))
    setApprovingLog(null)
  }

  async function handleAddDeduction(log: StudyLog) {
    const slot = selectedSlot[log.id]
    const minutes = parseInt(deductMinutes[log.id]) || 0
    if (!slot || minutes <= 0) return
    const reasonKey = deductReason[log.id] ?? DEDUCTION_REASONS[0]
    const reason = reasonKey === '기타' ? (deductCustom[log.id]?.trim() || '기타') : reasonKey
    const deduction = { slot, minutes, reason, by: profile!.name, at: new Date().toISOString() }
    setAddingDeduction(log.id)
    await addDeduction(log.id, deduction)
    setStudyLogs(prev => prev.map(l => {
      if (l.id !== log.id) return l
      const deductions = [...(l.deductions ?? []), deduction]
      const subjects = computeNetSubjects(l.scheduleSlots, deductions)
      const totalMinutes = Object.values(subjects).reduce((s, v) => s + (v ?? 0), 0)
      return { ...l, deductions, subjects: l.status === 'approved' ? subjects : l.subjects, totalMinutes: l.status === 'approved' ? totalMinutes : l.totalMinutes }
    }))
    setSelectedSlot(prev => ({ ...prev, [log.id]: null }))
    setDeductMinutes(prev => ({ ...prev, [log.id]: '' }))
    setDeductCustom(prev => ({ ...prev, [log.id]: '' }))
    setAddingDeduction(null)
  }

  if (loading || !profile) return <LoadingScreen />

  const MEDAL = ['🥇', '🥈', '🥉']
  const TABS: { key: Tab; label: string; emoji: string }[] = [
    { key: 'study', label: '학습 관리', emoji: '📚' },
    { key: 'lockstudy', label: '락스터디 관리', emoji: '🔐' },
    { key: 'schedule', label: '기간 설정', emoji: '📅' },
    { key: 'ranking', label: '지점 랭킹', emoji: '🏆' },
    { key: 'top10', label: 'TOP 10', emoji: '👑' },
    { key: 'branch', label: '지점 세부정보', emoji: '🏫' },
    ...(!isBranch ? [
      { key: 'codes' as Tab, label: '학생코드 관리', emoji: '🔑' },
    ] : []),
  ]

  async function applyBulk() {
    if (!bulkStart || !bulkEnd) return
    if (!confirm(`전체 ${allStudents.length}명에게 ${bulkStart} ~ ${bulkEnd} 기간을 일괄 적용할까요?`)) return
    setBulkApplying(true)
    await bulkSetSummerDates(allStudents.map(u => u.uid), bulkStart, bulkEnd)
    setAllStudents(prev => prev.map(u => ({ ...u, summerStart: bulkStart, summerEnd: bulkEnd })))
    setBulkApplying(false)
  }

  async function saveIndividual(uid: string) {
    if (!editStart || !editEnd) return
    setSavingUid(uid)
    await updateStudentSummerDates(uid, editStart, editEnd)
    setAllStudents(prev => prev.map(u => u.uid === uid ? { ...u, summerStart: editStart, summerEnd: editEnd } : u))
    setEditingUid(null)
    setSavingUid(null)
  }

  async function addCode() {
    if (!newCode.trim() || !newCodeBranch.trim()) return
    setAddingCode(true)
    await addStudentCode(newCode.trim().toUpperCase(), newCodeBranch.trim())
    setStudentCodes(prev => [...prev, {
      code: newCode.trim().toUpperCase(),
      branchName: newCodeBranch.trim(),
      createdAt: new Date().toISOString(),
    }])
    setNewCode('')
    setAddingCode(false)
  }

  async function deleteCode(code: string) {
    setDeletingCode(code)
    await deleteStudentCode(code)
    setStudentCodes(prev => prev.filter(c => c.code !== code))
    setDeletingCode(null)
  }

  async function sendPasswordReset(uid: string, name: string) {
    if (!confirm('이 학생의 비밀번호를 새로 초기화할까요?')) return
    setResettingUid(uid)
    try {
      const idToken = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ targetUid: uid }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '초기화에 실패했어요.')
      setResetSentUid(uid)
      setTimeout(() => setResetSentUid(null), 3000)
      setCopiedPw(false)
      setResetResult({ name, password: data.password })
    } catch (err) {
      alert(err instanceof Error ? err.message : '초기화에 실패했어요.')
    } finally {
      setResettingUid(null)
    }
  }

  async function copyResetPassword() {
    if (!resetResult) return
    try {
      await navigator.clipboard.writeText(resetResult.password)
      setCopiedPw(true)
      setTimeout(() => setCopiedPw(false), 2000)
    } catch {
      // 클립보드 권한이 없으면 무시 — 입력칸이 선택 가능해서 수동 복사 가능
    }
  }

  async function bulkDeleteSelected() {
    if (selectedCodes.size === 0) return
    if (!confirm(`선택한 ${selectedCodes.size}개 코드를 삭제할까요?`)) return
    setBulkDeleting(true)
    const codes = Array.from(selectedCodes)
    await bulkDeleteStudentCodes(codes)
    setStudentCodes(prev => prev.filter(c => !codes.includes(c.code)))
    setSelectedCodes(new Set())
    setBulkDeleting(false)
  }

  // 락스터디 셀 → 선택된 활동으로 칠하기 (수업/기타는 직접 입력한 텍스트로 저장)
  function setLockCell(uid: string, slotIdx: number) {
    const value = LOCK_CUSTOM_ACTIVITIES.includes(lockActiveActivity)
      ? (lockCustomText.trim() || lockActiveActivity)
      : lockActiveActivity
    setLockEntries(prev => {
      const row = prev[uid] ? [...prev[uid]] : Array(LOCK_STUDY_SLOTS.length).fill('')
      if (row[slotIdx] === value) return prev
      row[slotIdx] = value
      return { ...prev, [uid]: row }
    })
  }

  async function saveLockSchedule() {
    if (!lockBranch) return
    setLockSaving(true)
    await saveLockStudySchedule(lockBranch, lockStudyDay, lockEntries)
    setLockSaving(false)
  }

  async function saveSupervisor(day: string, name: string) {
    if (!lockBranch) return
    const updated = { ...lockSupervisors, [day]: name }
    setLockSupervisors(updated)
    await saveLockStudySupervisors(lockBranch, updated)
  }

  return (
    <div className="min-h-screen">

      {/* ── 왼쪽 사이드바 (lg+) ── */}
      <nav className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-56 z-50 bg-white/90 backdrop-blur-sm border-r border-purple-50 shadow-lg shadow-purple-100/20">
        {/* 브랜드 */}
        <div className="px-5 py-6 border-b border-purple-50">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔒</span>
            <div>
              <p className="text-xl font-black text-purple-dark leading-none">올락</p>
              <p className="text-[10px] font-bold text-purple-dark/50 leading-none mt-0.5">All Lock</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2 font-medium">잠그면, 오른다</p>
          <div className="mt-3 pt-3 border-t border-purple-50">
            <p className="text-sm font-bold text-gray-700">{profile.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{isBranch ? `지점 관리자 · ${mySchool}` : '본사 관리자'}</p>
          </div>
        </div>
        {/* 탭 메뉴 */}
        <div className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-sm font-bold transition-all text-left ${
                tab === t.key
                  ? 'bg-gradient-to-r from-purple-soft to-pink-soft text-white shadow-lg shadow-purple-100/30'
                  : 'text-gray-500 hover:bg-purple-light/30 hover:text-purple-dark'
              }`}>
              <span className="text-base flex-none">{t.emoji}</span>
              <span className="flex-1">{t.label}</span>
            </button>
          ))}
        </div>
        {/* 하단 링크 + 로그아웃 */}
        <div className="px-3 py-4 border-t border-purple-50 space-y-1">
          <Link href="/admin/report"
            className="flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-bold text-gray-500 hover:bg-purple-light/30 hover:text-purple-dark transition-all">
            📋 학생 리포트
          </Link>
          <Link href="/leaderboard"
            className="flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-bold text-gray-500 hover:bg-purple-light/30 hover:text-purple-dark transition-all">
            📢 리더보드
          </Link>
          <button onClick={async () => { await signOut(auth); router.replace('/login') }}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-bold text-gray-400 hover:bg-gray-100 transition-all">
            🚪 로그아웃
          </button>
        </div>
      </nav>

      {/* ── 메인 콘텐츠 ── */}
      <div className="lg:pl-56 pb-8">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* 헤더 (모바일) */}
        <div className="lg:hidden flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-purple-dark">올락 관리자</h1>
            <p className="text-sm text-gray-400">
              {profile.name} · {isBranch ? `지점 관리자 (${mySchool})` : '본사 관리자'}
            </p>
          </div>
          <button
            onClick={async () => { await signOut(auth); router.replace('/login') }}
            className="text-xs text-gray-400 bg-white/60 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-all"
          >
            로그아웃
          </button>
        </div>

        {/* 빠른 접근 (모바일) */}
        <div className="lg:hidden flex gap-2">
          <Link href="/admin/report" className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-mint-light to-peach-light font-bold text-sm text-gray-700 hover:shadow-md transition-all">
            <span>📋</span> 학생 리포트
          </Link>
          <Link href="/leaderboard" className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-purple-light to-pink-light font-bold text-sm text-gray-700 hover:shadow-md transition-all">
            <span>📢</span> 공개 리더보드
          </Link>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: '활동 학생', value: branchRanking.reduce((s, b) => s + b.studentCount, 0), color: 'from-purple-light to-mint-light', textColor: 'text-purple-dark', emoji: '👨‍🎓' },
            { label: isBranch ? '내 지점' : '지점 수', value: isBranch ? 1 : branchRanking.length, color: 'from-mint-light to-yellow-soft', textColor: 'text-mint-dark', emoji: '🏫' },
          ].map(card => (
            <div key={card.label} className={`bg-gradient-to-br ${card.color} rounded-3xl p-4 text-center space-y-1`}>
              <span className="text-2xl">{card.emoji}</span>
              <p className={`text-2xl font-black ${card.textColor}`}>{dataLoading ? '-' : card.value}</p>
              <p className="text-xs text-gray-500">{card.label}</p>
            </div>
          ))}
        </div>

        {/* 탭 (모바일) */}
        <div className="lg:hidden flex bg-white/60 rounded-2xl p-1 gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 min-w-max py-2 px-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                tab === t.key
                  ? 'bg-gradient-to-r from-purple-soft to-pink-soft text-white shadow-lg'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {/* ── 학습 관리 탭 ─── */}
        {tab === 'study' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={studyDate}
                onChange={e => setStudyDate(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-2xl border-2 border-purple-light bg-white/80 focus:border-purple-soft focus:outline-none text-sm font-medium text-purple-dark"
              />
            </div>

            {studyLoading ? (
              <div className="text-center py-12 text-gray-300 text-sm">불러오는 중...</div>
            ) : studyLogs.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-2">📭</div>
                <p className="text-gray-400 text-sm">이 날짜에 제출된 계획이 없어요</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400">
                  대기 {studyLogs.filter(l => l.status === 'planned').length}건 · 승인완료 {studyLogs.filter(l => l.status === 'approved').length}건
                </p>
                {studyLogs.map(log => (
                  <div key={log.id} className={`bg-white/80 rounded-3xl p-4 shadow-lg border space-y-3 ${
                    log.status === 'planned' ? 'border-yellow-200 shadow-yellow-100/30' : 'border-mint-soft/30 shadow-mint-100/20'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-gray-700">{log.userName}</p>
                        <p className="text-xs text-gray-400">{log.userSchool}</p>
                      </div>
                      {log.status === 'approved' ? (
                        <span className="text-xs bg-mint-light text-mint-dark px-2 py-1 rounded-full font-bold">✅ 승인완료</span>
                      ) : (
                        <span className="text-xs bg-yellow-soft text-orange-400 px-2 py-1 rounded-full font-bold">⏳ 승인대기</span>
                      )}
                    </div>

                    {/* 오늘의 기분 + 다짐 */}
                    {(log.mood || log.resolution) && (
                      <div className="bg-purple-light/30 rounded-2xl px-3 py-2 flex items-center gap-2">
                        {log.mood && <span className="text-xl flex-none">{log.mood}</span>}
                        {log.resolution && <p className="text-xs font-bold text-purple-dark">&ldquo;{log.resolution}&rdquo;</p>}
                      </div>
                    )}

                    {/* 계획 내용 */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold text-gray-500">학생 계획</p>
                      {SUBJECTS.map(sub => {
                        const p = log.plan[sub]
                        if (!p) return null
                        return (
                          <div key={sub} className="flex items-center gap-2 text-xs text-gray-600">
                            <span className="font-bold w-8" style={{ color: SUBJECT_COLORS[sub] }}>{sub}</span>
                            <span className="flex-1">{p.contents?.join(', ')}</span>
                            <span className="text-gray-400">{formatMinutes(p.plannedMinutes)} 계획</span>
                          </div>
                        )
                      })}
                    </div>

                    {/* 승인 완료: 실제 시간 표시 */}
                    {log.status === 'approved' && (
                      <div className="bg-mint-light/40 rounded-2xl p-3 space-y-1">
                        <p className="text-xs font-bold text-mint-dark">승인된 실제 시간 (승인: {log.approvedBy})</p>
                        <div className="flex flex-wrap gap-2">
                          {SUBJECTS.map(sub => {
                            const v = log.subjects[sub] ?? 0
                            if (!v) return null
                            return (
                              <span key={sub} className="text-xs bg-white/80 px-2 py-1 rounded-full text-gray-600 font-medium">
                                {sub} {formatMinutes(v)}
                              </span>
                            )
                          })}
                        </div>
                        <p className="text-xs font-black text-mint-dark text-right">총 {formatMinutes(log.totalMinutes)}</p>
                      </div>
                    )}

                    {/* 시간대별 감점 (학생이 시간표를 짜서 제출한 로그만 지원) */}
                    {hasScheduleSlots(log) && (
                      <div className="bg-purple-light/20 border border-purple-light rounded-2xl p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-gray-500">시간표</p>
                          <p className="text-xs text-gray-300">칸을 누르면 감점 입력</p>
                        </div>
                        <div className="space-y-0.5 max-h-56 overflow-y-auto">
                          {slotRange(log.scheduleSlots).map(time => {
                            const sub = log.scheduleSlots?.[time]
                            if (!sub) {
                              return (
                                <div key={time} className="flex items-center gap-2 text-xs text-gray-300 py-1">
                                  <span className="font-mono w-10 flex-none">{time}</span>
                                  <span className="flex-1 border-b border-dashed border-gray-100" />
                                </div>
                              )
                            }
                            const slotDeductions = (log.deductions ?? []).filter(d => d.slot === time)
                            const deductedMins = slotDeductions.reduce((s, d) => s + d.minutes, 0)
                            const isSelected = selectedSlot[log.id] === time
                            return (
                              <button key={time} type="button"
                                onClick={() => setSelectedSlot(prev => ({ ...prev, [log.id]: isSelected ? null : time }))}
                                className="w-full flex items-center gap-2 text-xs py-1 rounded-lg transition-all"
                                style={{ backgroundColor: isSelected ? '#EDE9FF' : 'transparent' }}>
                                <span className="font-mono w-10 flex-none text-gray-400">{time}</span>
                                <span className="flex-1 px-2 py-1 rounded-full text-white font-bold text-left truncate"
                                  style={{ backgroundColor: SUBJECT_COLORS[sub] }}>
                                  {sub}
                                </span>
                                {deductedMins > 0 && (
                                  <span className="text-xs bg-pink-dark text-white px-2 py-0.5 rounded-full font-bold flex-none">
                                    -{deductedMins}분
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>

                        {selectedSlot[log.id] && (
                          <div className="bg-pink-soft/10 border border-pink-soft/30 rounded-2xl p-3 space-y-2">
                            <p className="text-xs font-bold text-pink-dark">감점 추가 — {selectedSlot[log.id]}</p>
                            <div className="flex gap-1.5">
                              {DEDUCTION_REASONS.map(r => (
                                <button key={r} type="button"
                                  onClick={() => setDeductReason(prev => ({ ...prev, [log.id]: r }))}
                                  className="flex-1 text-xs font-bold py-1.5 rounded-full transition-all"
                                  style={(deductReason[log.id] ?? DEDUCTION_REASONS[0]) === r
                                    ? { backgroundColor: '#D4537E', color: '#fff' }
                                    : { backgroundColor: '#fff', color: '#993556', border: '1px solid #F0C2D3' }}>
                                  {r}
                                </button>
                              ))}
                            </div>
                            {(deductReason[log.id] ?? DEDUCTION_REASONS[0]) === '기타' && (
                              <input value={deductCustom[log.id] ?? ''}
                                onChange={e => setDeductCustom(prev => ({ ...prev, [log.id]: e.target.value }))}
                                placeholder="사유 직접 입력" maxLength={20}
                                className="w-full px-3 py-1.5 rounded-xl border border-pink-soft/30 bg-white text-xs focus:outline-none" />
                            )}
                            <div className="flex items-center gap-2">
                              <input type="number" min="1" max="30" value={deductMinutes[log.id] ?? ''}
                                onChange={e => setDeductMinutes(prev => ({ ...prev, [log.id]: e.target.value }))}
                                placeholder="분"
                                className="w-16 px-2 py-1.5 rounded-xl border border-pink-soft/30 bg-white text-xs text-center font-bold focus:outline-none" />
                              <span className="text-xs text-pink-dark">분 감점</span>
                              <button type="button" onClick={() => handleAddDeduction(log)}
                                disabled={addingDeduction === log.id}
                                className="ml-auto px-4 py-1.5 rounded-full text-xs font-bold text-white bg-pink-dark disabled:opacity-60">
                                {addingDeduction === log.id ? '추가 중...' : '감점 추가'}
                              </button>
                            </div>
                          </div>
                        )}

                        {(log.deductions ?? []).length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-gray-400">감점 이력</p>
                            {(log.deductions ?? []).map((d, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded-xl px-2.5 py-1.5">
                                <span className="font-mono text-gray-400">{d.slot}</span>
                                <span className="text-gray-600">{d.reason}</span>
                                <span className="text-pink-dark font-bold">-{d.minutes}분</span>
                                <span className="ml-auto text-gray-300">{d.by}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <p className="text-xs text-gray-400">
                            최종 인정 {formatMinutes(Object.values(computeNetSubjects(log.scheduleSlots, log.deductions)).reduce((s, v) => s + (v ?? 0), 0))}
                          </p>
                          {log.status === 'planned' && (
                            <button
                              onClick={() => approveLog(log)}
                              disabled={approvingLog === log.id}
                              className="px-4 py-2 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-soft to-mint-soft text-sm hover:from-purple-dark hover:to-mint-dark transition-all disabled:opacity-60"
                            >
                              {approvingLog === log.id ? '승인 중...' : '✅ 승인'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 승인 대기: 실제 시간 입력 (시간표 데이터 없는 기존 로그용 폴백) */}
                    {log.status === 'planned' && !hasScheduleSlots(log) && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-gray-500">실제 순공시간 입력 (분)</p>
                        <div className="grid grid-cols-5 gap-2">
                          {SUBJECTS.map(sub => (
                            <div key={sub} className="space-y-1">
                              <p className="text-xs text-center font-bold" style={{ color: SUBJECT_COLORS[sub] }}>{sub}</p>
                              <input
                                type="number"
                                min="0"
                                max="720"
                                value={actualMins[log.id]?.[sub] ?? '0'}
                                onChange={e => setActualMins(prev => ({
                                  ...prev,
                                  [log.id]: { ...(prev[log.id] ?? {}), [sub]: e.target.value } as Record<Subject, string>,
                                }))}
                                className="w-full px-1 py-1.5 rounded-xl border-2 border-gray-100 bg-gray-50 focus:outline-none text-xs font-bold text-center text-gray-700"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-400">
                            합계: {formatMinutes(SUBJECTS.reduce((s, sub) => s + (parseInt(actualMins[log.id]?.[sub]) || 0), 0))}
                          </p>
                          <button
                            onClick={() => approveLog(log)}
                            disabled={approvingLog === log.id}
                            className="px-4 py-2 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-soft to-mint-soft text-sm hover:from-purple-dark hover:to-mint-dark transition-all disabled:opacity-60"
                          >
                            {approvingLog === log.id ? '승인 중...' : '✅ 승인'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── 락스터디 관리 탭 ─── */}
        {tab === 'lockstudy' && (() => {
          const branchStudents = allStudents.filter(u => u.school === lockBranch)
          return (
            <div className="space-y-4">
              {/* 지점 선택 (본사 관리자만) / 지점명 표시 (지점 관리자) */}
              {isBranch ? (
                <p className="text-sm font-bold text-gray-600">{mySchool} 락스터디</p>
              ) : (
                <select
                  value={selectedBranch}
                  onChange={e => setSelectedBranch(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl border-2 border-purple-light bg-white/80 focus:border-purple-soft focus:outline-none text-sm font-medium text-purple-dark"
                >
                  <option value="">지점을 선택해주세요</option>
                  {[...new Set(allStudents.map(u => u.school))].sort().map(school => (
                    <option key={school} value={school}>{school}</option>
                  ))}
                </select>
              )}

              {lockBranch && (
                <>
                  {/* 요일 탭 */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {LOCK_STUDY_DAYS.map(d => (
                      <button key={d} onClick={() => setLockStudyDay(d)}
                        className="flex-none px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                        style={lockStudyDay === d
                          ? { background: 'linear-gradient(135deg,#C9B8FF,#FFB3C6)', color: '#fff' }
                          : { background: '#f3f4f6', color: '#9ca3af' }}>
                        {d}
                      </button>
                    ))}
                  </div>

                  <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-4 shadow-lg shadow-purple-100/30 border border-purple-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-600">{lockStudyDay}요일 입실/퇴실 관리</p>
                      <p className="text-xs text-gray-400">선택 후 드래그</p>
                    </div>

                    {/* 활동 선택 탭 */}
                    <div className="flex flex-wrap gap-1.5">
                      {LOCK_STUDY_ACTIVITIES.map(act => (
                        <button key={act}
                          onClick={() => setLockActiveActivity(act)}
                          className="text-xs px-2 py-0.5 rounded-full font-bold transition-all select-none"
                          style={{
                            backgroundColor: LOCK_ACT_COLORS[act],
                            color: '#374151',
                            outline: lockActiveActivity === act ? '2px solid #9B85FF' : 'none',
                            outlineOffset: '2px',
                            transform: lockActiveActivity === act ? 'scale(1.08)' : 'scale(1)',
                          }}>
                          {act}
                        </button>
                      ))}
                      <button
                        onClick={() => setLockActiveActivity('')}
                        className="text-xs px-2 py-0.5 rounded-full font-bold transition-all select-none"
                        style={{
                          backgroundColor: lockActiveActivity === '' ? '#9B85FF' : '#e5e7eb',
                          color: lockActiveActivity === '' ? '#fff' : '#9ca3af',
                          outline: lockActiveActivity === '' ? '2px solid #9B85FF' : 'none',
                          outlineOffset: '2px',
                        }}>
                        지우기
                      </button>
                    </div>

                    {/* 수업/기타 직접입력 */}
                    {LOCK_CUSTOM_ACTIVITIES.includes(lockActiveActivity) && (
                      <input
                        type="text"
                        value={lockCustomText}
                        onChange={e => setLockCustomText(e.target.value)}
                        placeholder="직접 입력 (예: 수학, 수학학원, 1:1수업)"
                        maxLength={10}
                        className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-purple-soft focus:outline-none text-xs text-gray-700 placeholder:text-gray-300"
                      />
                    )}

                    {/* 학생 x 시간 그리드 */}
                    {lockLoading ? (
                      <div className="text-center py-8 text-gray-300 text-sm">불러오는 중...</div>
                    ) : branchStudents.length === 0 ? (
                      <div className="text-center py-8 text-gray-300 text-sm">이 지점에 학생이 없어요</div>
                    ) : (
                      <div className="overflow-x-auto rounded-2xl border border-gray-100"
                        onTouchMove={(e) => {
                          if (!lockDragging) return
                          const touch = e.changedTouches[0]
                          const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement
                          const td = el?.closest('[data-uid]') as HTMLElement | null
                          if (td) {
                            const uid = td.getAttribute('data-uid') ?? ''
                            const slot = parseInt(td.getAttribute('data-slot') ?? '')
                            if (uid && !isNaN(slot)) setLockCell(uid, slot)
                          }
                        }}>
                        <table className="border-collapse text-[10px]" style={{ minWidth: `${64 + branchStudents.length * 56}px`, width: '100%' }}>
                          <thead>
                            <tr className="bg-purple-light/30">
                              <th className="sticky left-0 z-10 bg-purple-light/90 text-left text-gray-500 font-bold px-2 py-1.5 w-14 border-b border-gray-100">시간</th>
                              {branchStudents.map(u => (
                                <th key={u.uid} className="text-center text-gray-600 font-bold px-1 py-1.5 border-b border-gray-100 whitespace-nowrap">{u.name}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {LOCK_STUDY_SLOTS.map((time, slotIdx) => (
                              <tr key={time} className={slotIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                <td className="sticky left-0 z-10 bg-inherit text-gray-400 font-mono px-2 py-0.5 border-b border-gray-50 whitespace-nowrap">
                                  {time}
                                </td>
                                {branchStudents.map(u => {
                                  const act = lockEntries[u.uid]?.[slotIdx] ?? ''
                                  return (
                                    <td key={u.uid}
                                      data-uid={u.uid}
                                      data-slot={slotIdx}
                                      onPointerDown={() => { setLockDragging(true); setLockCell(u.uid, slotIdx) }}
                                      onPointerEnter={() => { if (lockDragging) setLockCell(u.uid, slotIdx) }}
                                      onTouchStart={() => { setLockDragging(true); setLockCell(u.uid, slotIdx) }}
                                      className="text-center px-0.5 py-0.5 border-b border-gray-50 cursor-pointer select-none"
                                      style={{
                                        backgroundColor: act ? lockColorFor(act) + 'CC' : undefined,
                                        touchAction: 'none',
                                      }}>
                                      <span className="block text-[10px] font-bold leading-none py-1.5 truncate px-0.5"
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
                    )}

                    <button onClick={saveLockSchedule} disabled={lockSaving || branchStudents.length === 0}
                      className="w-full py-3 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-soft to-pink-soft hover:from-purple-dark hover:to-pink-dark transition-all text-sm disabled:opacity-50">
                      {lockSaving ? '저장 중...' : `${lockStudyDay}요일 시간표 저장`}
                    </button>
                  </div>

                  {/* 요일별 감독 담당자 */}
                  <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-4 shadow-lg shadow-purple-100/30 border border-purple-50 space-y-3">
                    <p className="text-sm font-bold text-gray-600">요일별 감독 담당자</p>
                    <div className="space-y-2">
                      {LOCK_STUDY_DAYS.map(d => (
                        <div key={d} className="flex items-center gap-3">
                          <span className="w-8 text-xs font-bold text-gray-500 flex-none">{d}</span>
                          <input
                            key={`${lockBranch}-${d}`}
                            type="text"
                            defaultValue={lockSupervisors[d] ?? ''}
                            onBlur={e => saveSupervisor(d, e.target.value)}
                            placeholder="담당 조교/선생님 이름"
                            className="flex-1 px-3 py-2 rounded-xl border-2 border-gray-100 bg-gray-50 focus:border-purple-soft focus:outline-none text-sm text-gray-700 placeholder:text-gray-300"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        })()}

        {/* ── 기간 설정 탭 ─── */}
        {tab === 'schedule' && (
          <div className="space-y-5">

            {/* 일괄 설정 */}
            <div className="bg-white/80 rounded-3xl p-5 shadow-lg shadow-purple-100/20 border border-purple-50 space-y-4">
              <div>
                <p className="text-sm font-bold text-gray-700">일괄 설정</p>
                <p className="text-xs text-gray-400 mt-0.5">전체 학생에게 동일한 기간을 한번에 적용해요</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-500">시작일</p>
                  <input type="date" value={bulkStart} onChange={e => setBulkStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border-2 border-gray-100 bg-gray-50 focus:border-purple-soft focus:outline-none text-sm text-gray-700" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-500">종료일</p>
                  <input type="date" value={bulkEnd} onChange={e => setBulkEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border-2 border-gray-100 bg-gray-50 focus:border-purple-soft focus:outline-none text-sm text-gray-700" />
                </div>
              </div>
              <button onClick={applyBulk} disabled={bulkApplying || !bulkStart || !bulkEnd}
                className="w-full py-3 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-soft to-pink-soft hover:from-purple-dark hover:to-pink-dark transition-all text-sm disabled:opacity-50">
                {bulkApplying ? '적용 중...' : `전체 ${allStudents.length}명 일괄 적용`}
              </button>
            </div>

            {/* 개별 설정 */}
            <div className="space-y-3">
              <div>
                <p className="text-sm font-bold text-gray-700">학생별 개별 설정</p>
                <p className="text-xs text-gray-400 mt-0.5">일괄 적용 후 개별 수정도 가능해요</p>
              </div>
              {dataLoading ? (
                <div className="text-center py-8 text-gray-300 text-sm">불러오는 중...</div>
              ) : allStudents.length === 0 ? (
                <div className="text-center py-8 text-gray-300 text-sm">학생이 없어요</div>
              ) : (
                allStudents.map(u => {
                  const { start, end } = getEffectiveSummerDates(u)
                  const isEditing = editingUid === u.uid
                  const hasCustom = !!u.summerStart
                  return (
                    <div key={u.uid} className="bg-white/80 rounded-3xl p-4 shadow-sm border border-purple-50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-gray-700 text-sm">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.school}</p>
                        </div>
                        {!isEditing && (
                          <button
                            onClick={() => { setEditingUid(u.uid); setEditStart(start); setEditEnd(end) }}
                            className="text-xs bg-purple-light text-purple-dark px-3 py-1.5 rounded-full font-bold hover:bg-purple-soft/20 transition-all">
                            수정
                          </button>
                        )}
                      </div>

                      {!isEditing ? (
                        <div className="flex gap-3 text-xs">
                          <span className={`px-2 py-1 rounded-full font-bold ${hasCustom ? 'bg-purple-light text-purple-dark' : 'bg-gray-100 text-gray-400'}`}>
                            {hasCustom ? '개별 설정' : '기본값'}
                          </span>
                          <span className="text-gray-600">{start} ~ {end}</span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-gray-500">시작일</p>
                              <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)}
                                className="w-full px-2 py-1.5 rounded-xl border-2 border-purple-light bg-white focus:border-purple-soft focus:outline-none text-xs text-gray-700" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-gray-500">종료일</p>
                              <input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                                className="w-full px-2 py-1.5 rounded-xl border-2 border-purple-light bg-white focus:border-purple-soft focus:outline-none text-xs text-gray-700" />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setEditingUid(null)}
                              className="flex-1 py-2 rounded-xl text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all">
                              취소
                            </button>
                            <button onClick={() => saveIndividual(u.uid)} disabled={savingUid === u.uid}
                              className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-soft to-pink-soft disabled:opacity-60 transition-all">
                              {savingUid === u.uid ? '저장 중...' : '저장'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* ── 지점 랭킹 탭 ─── */}
        {tab === 'ranking' && (
          <div className="space-y-3">
            {/* 헤더 행 */}
            <div className="grid grid-cols-4 gap-2 px-2">
              {['지점', '참여자', '평균 공부시간', '누적 공부시간'].map(h => (
                <p key={h} className="text-[10px] font-bold text-gray-400 text-center">{h}</p>
              ))}
            </div>
            {dataLoading ? (
              <div className="text-center py-12 text-gray-300 text-sm">데이터 로딩 중...</div>
            ) : branchRanking.length === 0 ? (
              <div className="text-center py-12 text-gray-300 text-sm">아직 데이터가 없어요</div>
            ) : (
              branchRanking.map(b => (
                <div key={b.school} className="bg-white/80 rounded-2xl border border-purple-50 shadow-sm overflow-hidden">
                  <div className="grid grid-cols-4 gap-2 items-center px-3 py-3">
                    {/* 지점 */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg flex-none">{b.rank <= 3 ? MEDAL[b.rank - 1] : `${b.rank}위`}</span>
                      <p className="font-bold text-gray-700 text-xs truncate">{b.school}</p>
                    </div>
                    {/* 참여자 수 */}
                    <p className="text-sm font-black text-gray-600 text-center">{b.studentCount}명</p>
                    {/* 평균 공부시간 */}
                    <p className="text-sm font-black text-purple-dark text-center">{formatMinutes(b.avgMinutes)}</p>
                    {/* 누적 공부시간 */}
                    <p className="text-sm font-black text-mint-dark text-center">{formatMinutes(b.totalMinutes)}</p>
                  </div>
                  {/* 평균 기준 프로그레스 바 */}
                  <div className="h-1 bg-gray-100">
                    <div className="h-full bg-gradient-to-r from-purple-soft to-pink-soft"
                      style={{ width: `${branchRanking[0].avgMinutes > 0 ? (b.avgMinutes / branchRanking[0].avgMinutes) * 100 : 0}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── 학생 TOP 10 탭 ─── */}
        {tab === 'top10' && (
          <div className="space-y-3">
            {dataLoading ? (
              <div className="text-center py-12 text-gray-300 text-sm">데이터 로딩 중...</div>
            ) : studentRanking.length === 0 ? (
              <div className="text-center py-12 text-gray-300 text-sm">아직 데이터가 없어요</div>
            ) : (
              studentRanking.map(s => (
                <div key={s.uid} className="bg-white/80 rounded-3xl p-4 shadow-lg shadow-purple-100/20 border border-purple-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{s.rank <= 3 ? MEDAL[s.rank - 1] : `${s.rank}위`}</span>
                    <div>
                      <p className="font-bold text-gray-700">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.school}</p>
                    </div>
                  </div>
                  <p className="font-black text-purple-dark">{formatMinutes(s.totalMinutes)}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── 지점 세부정보 탭 ─── */}
        {tab === 'branch' && (() => {
          const effectiveBranch = isBranch ? mySchool : selectedBranch
          const branchCounts = Object.entries(
            allStudents.reduce((acc, u) => {
              acc[u.school] = (acc[u.school] ?? 0) + 1
              return acc
            }, {} as Record<string, number>)
          ).sort((a, b) => b[1] - a[1])

          return (
            <div className="space-y-4">
              {isBranch ? (
                <p className="text-sm font-bold text-gray-600">{mySchool} 학생 현황</p>
              ) : (
                <>
                  {/* 지점별 참여 인원 한눈에 보기 */}
                  {branchCounts.length > 0 && (
                    <div className="bg-white/80 rounded-3xl p-4 shadow-sm border border-purple-50 space-y-2">
                      <p className="text-sm font-bold text-gray-700">지점별 참여 인원 ({branchCounts.length}개 지점 · {allStudents.length}명)</p>
                      <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                        {branchCounts.map(([school, count]) => (
                          <button key={school} onClick={() => setSelectedBranch(school)}
                            className="flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all"
                            style={selectedBranch === school
                              ? { background: '#EDE9FF', border: '1px solid #C9B8FF' }
                              : { background: '#f9fafb', border: '1px solid transparent' }}>
                            <span className="text-gray-600 font-medium truncate">{school}</span>
                            <span className="font-black text-purple-dark flex-none ml-1">{count}명</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <select
                    value={selectedBranch}
                    onChange={e => setSelectedBranch(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl border-2 border-purple-light bg-white/80 focus:border-purple-soft focus:outline-none text-sm font-medium text-purple-dark"
                  >
                    <option value="">지점을 선택해주세요</option>
                    {[...new Set(allStudents.map(u => u.school))].sort().map(school => (
                      <option key={school} value={school}>{school}</option>
                    ))}
                  </select>
                </>
              )}

              {effectiveBranch && (() => {
                const branchStudents = allStudents.filter(u => u.school === effectiveBranch)
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-600">{effectiveBranch} · {branchStudents.length}명</p>
                      <button
                        onClick={() => {
                          const rows = branchStudents.map(u => {
                            const logs = allLogs.filter(l => l.userId === u.uid)
                            const total = logs.reduce((s, l) => s + l.totalMinutes, 0)
                            const days = logs.length
                            const dailyAvg = days > 0 ? Math.round(total / days) : 0
                            const weeklyGoal = u.goal?.weeklyMinutes ?? 0
                            const rate = weeklyGoal > 0 ? Math.min(100, Math.round((total / (weeklyGoal * 4)) * 100)) : 0
                            const { start, end } = getEffectiveSummerDates(u)
                            const period = `${start.slice(5).replace('-', '/')} ~ ${end.slice(5).replace('-', '/')}`
                            return {
                              name: u.name,
                              school: u.school,
                              gradeLabel: u.gradeLevel ? GRADE_LEVEL_LABELS[u.gradeLevel] : '-',
                              code: studentCodes.find(c => c.usedBy === u.uid)?.code ?? '-',
                              period, dailyAvgMinutes: dailyAvg, totalMinutes: total, achievementRate: rate,
                            }
                          })
                          exportBranchDetailXlsx(effectiveBranch, rows)
                        }}
                        className="px-4 py-2 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-mint-soft to-purple-soft hover:from-mint-dark hover:to-purple-dark transition-all"
                      >
                        📥 엑셀 다운로드
                      </button>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-purple-50">
                      <table className="w-full text-xs min-w-[860px]">
                        <thead>
                          <tr className="bg-purple-light/30">
                            {['학생명', '아이디', '학교급', '학생코드', '썸머스쿨기간', '일평균순공', '누적순공', '달성률', '계정'].map(h => (
                              <th key={h} className="px-3 py-2.5 text-left font-bold text-gray-600 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {branchStudents.length === 0 ? (
                            <tr><td colSpan={9} className="text-center py-8 text-gray-300">학생 데이터가 없어요</td></tr>
                          ) : branchStudents.map(u => {
                            const logs = allLogs.filter(l => l.userId === u.uid)
                            const total = logs.reduce((s, l) => s + l.totalMinutes, 0)
                            const days = logs.length
                            const dailyAvg = days > 0 ? Math.round(total / days) : 0
                            const weeklyGoal = u.goal?.weeklyMinutes ?? 0
                            const rate = weeklyGoal > 0 ? Math.min(100, Math.round((total / (weeklyGoal * 4)) * 100)) : 0
                            const { start, end } = getEffectiveSummerDates(u)
                            const code = studentCodes.find(c => c.usedBy === u.uid)?.code ?? '-'
                            return (
                              <tr key={u.uid} className="border-t border-purple-50 hover:bg-purple-light/10">
                                <td className="px-3 py-2.5 font-bold text-gray-700 whitespace-nowrap">{u.name}</td>
                                <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fromLoginEmail(u.email)}</td>
                                <td className="px-3 py-2.5 text-gray-500">{u.gradeLevel ? GRADE_LEVEL_LABELS[u.gradeLevel] : '-'}</td>
                                <td className="px-3 py-2.5 text-gray-500 font-mono">{code}</td>
                                <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{start.slice(5).replace('-', '/')} ~ {end.slice(5).replace('-', '/')}</td>
                                <td className="px-3 py-2.5 font-bold text-purple-dark text-right">{formatMinutes(dailyAvg)}</td>
                                <td className="px-3 py-2.5 font-bold text-mint-dark text-right">{formatMinutes(total)}</td>
                                <td className="px-3 py-2.5 text-right">
                                  <span className={`font-bold ${rate >= 100 ? 'text-mint-dark' : rate >= 70 ? 'text-purple-dark' : 'text-gray-500'}`}>{rate}%</span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <button
                                    onClick={() => sendPasswordReset(u.uid, u.name)}
                                    disabled={resettingUid === u.uid}
                                    title="비밀번호 즉시 초기화"
                                    className="text-xs bg-purple-light text-purple-dark px-2.5 py-1 rounded-full font-bold hover:bg-purple-soft/30 transition-all disabled:opacity-50 whitespace-nowrap">
                                    {resetSentUid === u.uid ? '✅ 완료' : resettingUid === u.uid ? '처리 중...' : '🔑 초기화'}
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })()}

        {/* ── 학생코드 관리 탭 ─── */}
        {tab === 'codes' && !isBranch && (
          <div className="space-y-4">
            {/* 코드 추가 */}
            <div className="bg-white/80 rounded-3xl p-4 shadow-sm border border-purple-50 space-y-3">
              <p className="text-sm font-bold text-gray-700">코드 추가</p>
              <div className="space-y-2">
                <input
                  type="text"
                  value={newCode}
                  onChange={e => setNewCode(e.target.value.toUpperCase())}
                  placeholder="코드 (예: 202512345678)"
                  className="w-full px-4 py-2.5 rounded-2xl border-2 border-gray-100 bg-gray-50 focus:border-purple-soft focus:outline-none text-sm font-mono text-gray-700 placeholder:text-gray-300"
                />
                <select
                  value={newCodeBranch}
                  onChange={e => setNewCodeBranch(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl border-2 border-gray-100 bg-gray-50 focus:border-purple-soft focus:outline-none text-sm text-gray-700"
                >
                  <option value="">지점을 선택해주세요</option>
                  {BRANCHES.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={addCode}
                    disabled={addingCode || !newCode.trim() || !newCodeBranch.trim()}
                    className="flex-1 py-2.5 rounded-2xl font-bold text-white text-sm bg-gradient-to-r from-purple-soft to-pink-soft disabled:opacity-50 hover:from-purple-dark hover:to-pink-dark transition-all"
                  >
                    {addingCode ? '추가 중...' : '+ 코드 추가'}
                  </button>
                  <label className="flex-1 py-2.5 rounded-2xl font-bold text-gray-600 text-sm bg-gray-100 hover:bg-gray-200 transition-all cursor-pointer text-center">
                    📤 엑셀 일괄 업로드
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={async e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const entries = await parseBranchCodesFromXlsx(file)
                        if (entries.length === 0) {
                          alert('파싱된 코드가 없어요. 형식: A열=코드, B열=지점명 (1행은 헤더)')
                          return
                        }
                        await bulkAddStudentCodes(entries)
                        const updated = await getStudentCodes()
                        setStudentCodes(updated)
                        e.target.value = ''
                        alert(`${entries.length}개 코드가 추가됐어요.`)
                      }}
                    />
                  </label>
                </div>
              </div>
              <p className="text-xs text-gray-400">엑셀 형식: A열=코드, B열=지점명 (1행은 헤더)</p>
            </div>

            {/* 검색 + 지점 필터 */}
            <div className="flex gap-2">
              <input
                type="text"
                value={codeSearch}
                onChange={e => setCodeSearch(e.target.value)}
                placeholder="🔍 코드 검색"
                className="flex-1 px-4 py-2.5 rounded-2xl border-2 border-gray-100 bg-gray-50 focus:border-purple-soft focus:outline-none text-sm font-mono text-gray-700 placeholder:text-gray-300 placeholder:font-sans"
              />
              <select
                value={codeBranchFilter}
                onChange={e => setCodeBranchFilter(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-2xl border-2 border-gray-100 bg-gray-50 focus:border-purple-soft focus:outline-none text-sm text-gray-700"
              >
                <option value="">전체 지점</option>
                {BRANCHES.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* 코드 목록 */}
            {codesLoading ? (
              <div className="text-center py-8 text-gray-300 text-sm">불러오는 중...</div>
            ) : studentCodes.length === 0 ? (
              <div className="text-center py-8 text-gray-300 text-sm">등록된 코드가 없어요</div>
            ) : (() => {
              const filtered = studentCodes
                .filter(c => !codeBranchFilter || c.branchName === codeBranchFilter)
                .filter(c => !codeSearch.trim() || c.code.includes(codeSearch.trim().toUpperCase()))
                .sort((a, b) => a.branchName.localeCompare(b.branchName) || a.code.localeCompare(b.code))
              const selectableCodes = filtered.filter(c => !c.usedBy).map(c => c.code)
              const allSelected = selectableCodes.length > 0 && selectableCodes.every(code => selectedCodes.has(code))
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-gray-400">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={e => {
                          setSelectedCodes(prev => {
                            const next = new Set(prev)
                            if (e.target.checked) selectableCodes.forEach(code => next.add(code))
                            else selectableCodes.forEach(code => next.delete(code))
                            return next
                          })
                        }}
                        className="accent-purple-400"
                      />
                      전체 선택 · {filtered.length}개 (총 {studentCodes.length}개 · 사용됨 {studentCodes.filter(c => c.usedBy).length}개)
                    </label>
                    {selectedCodes.size > 0 && (
                      <button
                        onClick={bulkDeleteSelected}
                        disabled={bulkDeleting}
                        className="text-xs bg-pink-light text-pink-dark px-3 py-1.5 rounded-full font-bold hover:bg-pink-soft/30 transition-all disabled:opacity-50"
                      >
                        {bulkDeleting ? '삭제 중...' : `🗑️ 선택 삭제 (${selectedCodes.size})`}
                      </button>
                    )}
                  </div>
                  {filtered.length === 0 ? (
                    <div className="text-center py-8 text-gray-300 text-sm">조건에 맞는 코드가 없어요</div>
                  ) : filtered.map(c => (
                    <div key={c.code} className="bg-white/80 rounded-2xl px-4 py-3 border border-purple-50 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedCodes.has(c.code)}
                          disabled={!!c.usedBy}
                          onChange={e => {
                            setSelectedCodes(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(c.code)
                              else next.delete(c.code)
                              return next
                            })
                          }}
                          className="accent-purple-400 flex-none disabled:opacity-20"
                        />
                        <div className="min-w-0">
                          <p className="font-mono font-bold text-gray-700 text-sm truncate">{c.code}</p>
                          <p className="text-xs text-gray-400 truncate">{c.branchName}</p>
                          {c.usedBy && <p className="text-xs text-mint-dark font-medium">✅ 사용됨</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteCode(c.code)}
                        disabled={deletingCode === c.code || !!c.usedBy}
                        title={c.usedBy ? '이미 사용된 코드는 삭제할 수 없어요' : '삭제'}
                        className="text-sm text-gray-300 hover:text-pink-dark disabled:opacity-20 transition-all px-2 py-1 rounded-lg hover:bg-pink-light flex-none"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}
      </div>
      </div>

      {resetResult && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center px-6"
          onClick={() => setResetResult(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center space-y-1">
              <div className="text-3xl">🔑</div>
              <p className="text-sm font-bold text-gray-700">{resetResult.name} 학생의 새 비밀번호</p>
              <p className="text-xs text-gray-400">학생에게 전달해주세요</p>
            </div>
            <div className="flex items-center gap-2">
              <input readOnly value={resetResult.password} onFocus={e => e.target.select()}
                className="flex-1 px-4 py-3 rounded-2xl border-2 border-purple-light bg-purple-light/30 text-center font-mono text-lg font-bold text-purple-dark tracking-wider focus:outline-none" />
              <button onClick={copyResetPassword}
                className="px-4 py-3 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-soft to-pink-soft hover:from-purple-dark hover:to-pink-dark transition-all flex-none text-sm">
                {copiedPw ? '✅' : '복사'}
              </button>
            </div>
            <button onClick={() => setResetResult(null)}
              className="w-full py-3 rounded-2xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all text-sm">
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
