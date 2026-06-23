'use client'
// 공개 리더보드 — 로그인 없이 누구나 열람 가능 (어제 TOP5 + 이번주 TOP10)

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { getDailyTop, getWeeklyTop, DailyEntry } from '@/lib/firestore'
import { formatMinutes, toDateStr, getWeekFromDate } from '@/lib/config'

const MEDAL = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']

// 이름 가운데 블러 처리 (개인정보 보호)
function blurName(name: string): string {
  if (name.length <= 1) return name
  if (name.length === 2) return name[0] + '*'
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1]
}

function EntryCard({ entry, big = false }: { entry: DailyEntry; big?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-3xl px-4 py-3 border transition-all ${
      entry.rank === 1
        ? 'bg-gradient-to-r from-yellow-soft to-peach-light border-peach-soft/50 shadow-lg shadow-peach-200/40'
        : entry.rank <= 3
        ? 'bg-white/90 border-purple-50 shadow-md shadow-purple-100/30'
        : 'bg-white/60 border-purple-50/40 shadow-sm'
    }`}>
      <div className="flex items-center gap-3">
        <span className={big ? 'text-3xl' : 'text-xl'}>{MEDAL[entry.rank - 1]}</span>
        <div>
          <p className={`font-black ${big ? 'text-lg' : 'text-sm'} text-gray-700`}>
            {blurName(entry.userName)}
          </p>
          <p className="text-xs text-gray-400">{entry.userSchool}</p>
        </div>
      </div>
      <p className={`font-black ${big ? 'text-xl' : 'text-sm'} text-purple-dark`}>
        {formatMinutes(entry.totalMinutes)}
      </p>
    </div>
  )
}

export default function LeaderboardPage() {
  const [dailyTop, setDailyTop] = useState<DailyEntry[]>([])
  const [weeklyTop, setWeeklyTop] = useState<DailyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState('')

  const yesterday = toDateStr(new Date(Date.now() - 86400000))
  const today = toDateStr(new Date())
  const currentWeek = getWeekFromDate(today)

  const load = useCallback(async () => {
    setLoading(true)
    const [daily, weekly] = await Promise.all([
      getDailyTop(yesterday, 5),
      getWeeklyTop(currentWeek, 10),
    ])
    setDailyTop(daily)
    setWeeklyTop(weekly)
    setLastUpdated(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))
    setLoading(false)
  }, [yesterday, currentWeek])

  useEffect(() => {
    load()
    // 5분마다 자동 갱신 (지점 TV 디스플레이 용도)
    const interval = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [load])

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-lg mx-auto space-y-8">
        {/* 헤더 */}
        <div className="text-center space-y-2">
          <div className="text-5xl">🔒</div>
          <h1 className="text-4xl font-black text-purple-dark tracking-tight">올락</h1>
          <p className="text-gray-400 text-sm font-medium">잠그면, 오른다</p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <p className="text-xs text-gray-300">업데이트 {lastUpdated}</p>
            <button
              onClick={load}
              disabled={loading}
              className="text-xs text-purple-soft hover:text-purple-dark transition-colors disabled:opacity-40"
            >
              {loading ? '로딩...' : '새로고침'}
            </button>
          </div>
        </div>

        {/* 어제 TOP 5 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <div>
              <h2 className="font-black text-gray-700 text-lg">어제의 TOP 5</h2>
              <p className="text-xs text-gray-400">{yesterday} 순공시간 기준</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-16 rounded-3xl bg-white/50 animate-pulse" />
              ))}
            </div>
          ) : dailyTop.length === 0 ? (
            <div className="text-center py-10 bg-white/60 rounded-3xl">
              <p className="text-gray-300 text-sm">어제 입력된 기록이 없어요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {dailyTop.map(e => (
                <EntryCard key={e.userId} entry={e} big={e.rank === 1} />
              ))}
            </div>
          )}
        </div>

        {/* 이번 주 TOP 10 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏆</span>
            <div>
              <h2 className="font-black text-gray-700 text-lg">이번 주 TOP 10</h2>
              <p className="text-xs text-gray-400">{currentWeek}주차 누적 순공시간</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 rounded-3xl bg-white/50 animate-pulse" />
              ))}
            </div>
          ) : weeklyTop.length === 0 ? (
            <div className="text-center py-10 bg-white/60 rounded-3xl">
              <p className="text-gray-300 text-sm">이번 주 데이터가 없어요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {weeklyTop.map(e => (
                <EntryCard key={e.userId} entry={e} />
              ))}
            </div>
          )}
        </div>

        {/* 하단 링크 */}
        <div className="flex gap-3 justify-center pb-4">
          <Link href="/login"
            className="px-5 py-2.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-purple-soft to-pink-soft shadow-lg shadow-purple-200/40 hover:from-purple-dark hover:to-pink-dark transition-all">
            로그인
          </Link>
          <Link href="/register"
            className="px-5 py-2.5 rounded-2xl text-sm font-bold text-purple-dark bg-purple-light hover:bg-purple-soft/30 transition-all">
            회원가입
          </Link>
        </div>
      </div>
    </div>
  )
}
