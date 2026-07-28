'use client'
// 스터디타이머 — 오늘 플래너 시간표 기준으로 지금 시간대 과목을 보여주는 전체화면 집중 모드.
// 탭 전환 + (모바일) 휴대폰 뒤집기(화면 아래로) 둘 다 감지해서, 둘 중 하나라도
// 어긋나면 자동으로 "자리비움" 감점을 기록한다.

import { useEffect, useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getLogForDate, addDeduction } from '@/lib/firestore'
import { computeNetSubjects } from '@/lib/deductions'
import { StudyLog, SUBJECT_COLORS, Subject } from '@/types'
import { toDateStr, formatMinutes } from '@/lib/config'
import LoadingScreen from '@/components/LoadingScreen'

const AWAY_THRESHOLD_SEC = 30 // 이보다 짧은 이탈은 무시 (노이즈 방지)
// 뒤집힘 판정에 여유 구간(히스테리시스)을 둬서 z값이 문턱 근처에서 흔들릴 때 깜빡이지 않도록 함
const FACE_DOWN_ENTER_Z = -7 // 이보다 낮아야 "뒤집힘"으로 새로 판정
const FACE_DOWN_EXIT_Z = -3 // 이보다 높아야 "안 뒤집힘"으로 복귀 (그 사이는 이전 상태 유지)
const FACE_DOWN_DEBOUNCE_MS = 500 // 판정이 바뀐 뒤에도 이 시간 이상 유지돼야 실제로 반영

type MotionPermissionAPI = { requestPermission?: () => Promise<'granted' | 'denied'> }

function slotKeyAt(d: Date): string {
  const totalMin = d.getHours() * 60 + d.getMinutes()
  const rounded = totalMin - (totalMin % 30)
  const h = Math.floor(rounded / 60)
  const m = rounded % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function nextSlotAfter(slots: string[], key: string): string | null {
  return slots.find(s => s > key) ?? null
}

export default function TimerPage() {
  const { user, profile, loading, demoMode } = useAuth()
  const router = useRouter()

  const [log, setLog] = useState<StudyLog | null>(null)
  const [loadingLog, setLoadingLog] = useState(true)
  const [now, setNow] = useState(new Date())
  const [slotElapsedSec, setSlotElapsedSec] = useState(0)
  const [awayNotice, setAwayNotice] = useState<string | null>(null)
  const [motionSupported, setMotionSupported] = useState(false)
  const [motionPermission, setMotionPermission] = useState<'unknown' | 'granted' | 'denied' | 'unnecessary'>('unknown')
  const [faceDown, setFaceDown] = useState(false)
  const [motionActive, setMotionActive] = useState(false) // 실제 센서 데이터를 한 번이라도 받았는지 (PC는 API만 있고 데이터가 안 옴)
  const [started, setStarted] = useState(false) // "타이머 시작하기" 눌러야 카운트 시작 (그 전엔 이탈 감지도 안 함)

  const slotKeyRef = useRef<string>(slotKeyAt(new Date()))
  const tabVisibleRef = useRef(true)
  const faceDownRef = useRef(false)
  const pendingFaceDownRef = useRef<boolean | null>(null)
  const pendingSinceRef = useRef(0)
  const motionActiveRef = useRef(false)
  const focusedRef = useRef(true)
  const startedRef = useRef(false)
  const unfocusedAtRef = useRef<number | null>(null)
  const unfocusedSlotRef = useRef<string | null>(null)
  const logRef = useRef<StudyLog | null>(null)
  useEffect(() => { logRef.current = log }, [log])

  useEffect(() => {
    if (loading) return
    if (demoMode) return
    if (!user || !profile) { router.replace('/login'); return }
    if (profile.role === 'pending') { router.replace('/pending'); return }
  }, [loading, user, profile, router, demoMode])

  useEffect(() => {
    if (!profile || (!demoMode && !user)) return
    setLoadingLog(true)
    getLogForDate(profile.uid, toDateStr(new Date())).then(l => {
      setLog(l)
      setLoadingLog(false)
    })
  }, [profile, user, demoMode])

  // 1초마다 시계 갱신
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // 슬롯 경과시간: 완전히 집중 상태(탭 보임 + 화면 아래)일 때만 누적, 슬롯 바뀌면 리셋
  useEffect(() => {
    const key = slotKeyAt(now)
    if (key !== slotKeyRef.current) {
      slotKeyRef.current = key
      setSlotElapsedSec(0)
      return
    }
    if (startedRef.current && focusedRef.current) {
      setSlotElapsedSec(s => s + 1)
    }
  }, [now])

  // 집중 이탈/복귀 공통 처리 (탭 전환, 뒤집기 둘 다 여기로 모임)
  function handleFocusChange(focused: boolean) {
    if (!startedRef.current) return
    if (focused === focusedRef.current) return
    focusedRef.current = focused

    if (!focused) {
      unfocusedAtRef.current = Date.now()
      unfocusedSlotRef.current = slotKeyRef.current
      return
    }

    const unfocusedAt = unfocusedAtRef.current
    const awaySlot = unfocusedSlotRef.current
    unfocusedAtRef.current = null
    unfocusedSlotRef.current = null
    if (unfocusedAt == null || awaySlot == null) return

    const awaySec = (Date.now() - unfocusedAt) / 1000
    if (awaySec < AWAY_THRESHOLD_SEC) return

    const currentLog = logRef.current
    if (!currentLog || currentLog.status !== 'planned') return
    if (!currentLog.scheduleSlots?.[awaySlot]) return

    const minutes = Math.min(30, Math.max(1, Math.round(awaySec / 60)))
    const deduction = { slot: awaySlot, minutes, reason: '자리비움', by: '자동 감지', at: new Date().toISOString() }

    addDeduction(currentLog.id, deduction).then(() => {
      setLog(prev => prev ? { ...prev, deductions: [...(prev.deductions ?? []), deduction] } : prev)
      setAwayNotice(`자리를 비운 ${minutes}분이 자동으로 기록됐어요.`)
      setTimeout(() => setAwayNotice(null), 5000)
    }).catch(() => {
      if (profile) getLogForDate(profile.uid, toDateStr(new Date())).then(setLog)
    })
  }

  function effectiveFaceDown() {
    return motionActiveRef.current ? faceDownRef.current : true
  }

  // 탭 전환 감지
  useEffect(() => {
    function onVisibility() {
      tabVisibleRef.current = !document.hidden
      handleFocusChange(tabVisibleRef.current && effectiveFaceDown())
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [profile])

  // 뒤집기(화면 아래) 감지 — 실제 센서 데이터가 들어오는 기기에서만 동작.
  // PC 등 센서가 없는 환경은 API 존재 여부와 무관하게 데이터가 안 오므로 자동으로 무시됨.
  useEffect(() => {
    const hasMotion = typeof window !== 'undefined' && 'DeviceMotionEvent' in window
    setMotionSupported(hasMotion)
    const needsPermission = hasMotion && typeof (DeviceMotionEvent as unknown as MotionPermissionAPI).requestPermission === 'function'
    if (!needsPermission) setMotionPermission('unnecessary')

    if (hasMotion && !needsPermission) {
      window.addEventListener('devicemotion', onMotionEvent)
    }
    return () => window.removeEventListener('devicemotion', onMotionEvent)
  }, [profile])

  function onMotionEvent(e: DeviceMotionEvent) {
    const z = e.accelerationIncludingGravity?.z
    if (z == null) return
    if (!motionActiveRef.current) {
      motionActiveRef.current = true
      setMotionActive(true)
    }

    // 문턱값 사이(dead zone)에서는 직전 확정 상태를 그대로 유지
    let rawDown = faceDownRef.current
    if (z < FACE_DOWN_ENTER_Z) rawDown = true
    else if (z > FACE_DOWN_EXIT_Z) rawDown = false

    if (rawDown === faceDownRef.current) {
      pendingFaceDownRef.current = null
      return
    }

    const now = Date.now()
    if (pendingFaceDownRef.current !== rawDown) {
      pendingFaceDownRef.current = rawDown
      pendingSinceRef.current = now
      return
    }
    if (now - pendingSinceRef.current < FACE_DOWN_DEBOUNCE_MS) return

    pendingFaceDownRef.current = null
    faceDownRef.current = rawDown
    setFaceDown(rawDown)
    handleFocusChange(tabVisibleRef.current && rawDown)
  }

  async function requestMotionPermission() {
    try {
      const api = DeviceMotionEvent as unknown as MotionPermissionAPI
      const result = await api.requestPermission?.()
      setMotionPermission(result === 'granted' ? 'granted' : 'denied')
      if (result === 'granted') {
        window.addEventListener('devicemotion', onMotionEvent)
      }
    } catch {
      setMotionPermission('denied')
    }
  }

  // "타이머 시작하기" — 카운트 시작과 센서 권한 요청을 하나의 탭으로 묶는다.
  // (iOS는 권한 요청이 사용자 탭 안에서 곧바로 호출돼야 하고, 시작 전에는 이탈 감지도 하지 않는다)
  async function startTimer() {
    if (motionSupported && motionPermission === 'unknown') {
      await requestMotionPermission()
    }
    slotKeyRef.current = slotKeyAt(new Date())
    setSlotElapsedSec(0)
    focusedRef.current = true
    unfocusedAtRef.current = null
    unfocusedSlotRef.current = null
    startedRef.current = true
    setStarted(true)
  }

  const currentSlotKey = slotKeyAt(now)
  const slots = useMemo(
    () => Object.keys(log?.scheduleSlots ?? {}).sort(),
    [log?.scheduleSlots],
  )
  const currentSubject: Subject | undefined = log?.scheduleSlots?.[currentSlotKey]
  const upcoming = !currentSubject ? nextSlotAfter(slots, currentSlotKey) : null

  const estimatedNet = useMemo(
    () => computeNetSubjects(log?.scheduleSlots, log?.deductions),
    [log?.scheduleSlots, log?.deductions],
  )
  const estimatedTotal = Object.values(estimatedNet).reduce((s, v) => s + (v ?? 0), 0)

  const usingMotion = motionPermission === 'granted' || motionActive

  if (loading || (!demoMode && !profile) || loadingLog) return <LoadingScreen />

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-br from-purple-light via-white to-pink-light">
      <div className="max-w-lg mx-auto min-h-full px-5 py-6 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <a href="/dashboard" className="w-9 h-9 flex items-center justify-center rounded-full bg-white/70 text-gray-400 font-bold">✕</a>
          <p className="text-sm font-black text-purple-dark">스터디타이머</p>
          <div className="w-9" />
        </div>

        {awayNotice && (
          <div className="bg-pink-light/60 text-pink-dark text-sm font-bold rounded-2xl px-4 py-3 text-center mb-4">
            ⏸ {awayNotice}
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center">
          {!log || slots.length === 0 ? (
            <div className="text-center">
              <div className="text-5xl mb-3">📭</div>
              <p className="text-gray-400 text-sm mb-4">아직 오늘 시간표가 있는 계획을 안 세웠어요</p>
              <a href="/log" className="inline-block px-5 py-2.5 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-soft to-pink-soft text-sm">
                플래너 입력하러 가기 →
              </a>
            </div>
          ) : log.status === 'approved' ? (
            <div className="text-center">
              <div className="text-5xl mb-3">✅</div>
              <p className="text-gray-600 font-bold mb-1">오늘 계획은 이미 승인 완료됐어요</p>
              <p className="text-gray-400 text-sm">총 {formatMinutes(log.totalMinutes)} 인정 · 수고하셨어요!</p>
            </div>
          ) : currentSubject ? (
            <div className="text-center w-full">
              <p className="text-sm text-gray-400 font-bold tabular-nums mb-1">
                {now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </p>
              <p className="text-sm text-gray-400 mb-2">지금 시간대</p>
              <p className="text-5xl font-black mb-4" style={{ color: SUBJECT_COLORS[currentSubject] }}>
                {currentSubject}
              </p>

              {!started ? (
                <>
                  <button onClick={startTimer}
                    className="mt-2 px-8 py-4 rounded-3xl font-black text-white text-lg bg-gradient-to-r from-purple-soft to-pink-soft shadow-lg shadow-purple-200/40">
                    ▶ 타이머 시작하기
                  </button>
                  {motionSupported && motionPermission === 'unknown' && (
                    <p className="text-xs text-gray-400 mt-3">시작하면 휴대폰 뒤집기 감지를 위한 센서 권한을 요청해요</p>
                  )}
                </>
              ) : (
                <>
                  {usingMotion && !faceDown && (
                    <div className="bg-pink-light/70 rounded-2xl px-4 py-3 mb-4">
                      <p className="text-2xl mb-1">📱</p>
                      <p className="text-pink-dark font-black text-sm">일시정지됨 · 휴대폰을 뒤집으면 다시 시작돼요</p>
                    </div>
                  )}
                  <p className={`text-7xl font-black tabular-nums ${usingMotion && !faceDown ? 'text-gray-300' : 'text-purple-dark'}`}>
                    {String(Math.floor(slotElapsedSec / 60)).padStart(2, '0')}:{String(slotElapsedSec % 60).padStart(2, '0')}
                  </p>
                  <p className="text-gray-300 text-lg mb-4">/ 30:00</p>
                  <div className="w-full h-2 bg-purple-light/40 rounded-full overflow-hidden mb-6">
                    <div className="h-full bg-gradient-to-r from-purple-soft to-pink-soft transition-all"
                      style={{ width: `${Math.min(100, (slotElapsedSec / (30 * 60)) * 100)}%` }} />
                  </div>
                  {usingMotion && faceDown && (
                    <p className="text-xs font-bold text-mint-dark">📴 화면이 아래로 향해 있어요 · 집중 중</p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="text-center">
              <div className="text-5xl mb-3">☕</div>
              <p className="text-gray-500 font-bold mb-1">지금은 계획된 공부 시간이 아니에요</p>
              {upcoming && (
                <p className="text-sm text-gray-400">
                  다음 시간표: <span className="font-bold text-purple-dark">{upcoming} {log.scheduleSlots?.[upcoming]}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {log && log.status === 'planned' && slots.length > 0 && (
          <div className="space-y-3">
            <div className="bg-purple-light/20 rounded-2xl px-4 py-3 text-xs text-gray-500 text-center">
              탭을 벗어나거나{usingMotion ? ' 휴대폰을 뒤집지 않으면' : ''} {AWAY_THRESHOLD_SEC}초 이상부터 자동으로 자리비움이 기록돼요.
            </div>
            <div className="bg-white/80 rounded-3xl p-4 shadow-lg shadow-purple-100/20 border border-purple-50 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-600">예상 인정시간</p>
                <p className="text-sm font-black text-purple-dark">{formatMinutes(estimatedTotal)}</p>
              </div>
              {(log.deductions ?? []).length > 0 && (
                <div className="space-y-1 pt-1 max-h-32 overflow-y-auto">
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
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
