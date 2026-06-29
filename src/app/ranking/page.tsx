'use client'
// 랭킹 페이지 — 전국 TOP 10 (학생 전용)

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getCachedRankings, StudentRanking } from '@/lib/firestore'
import { formatMinutes } from '@/lib/config'
import BottomNav from '@/components/BottomNav'
import LoadingScreen from '@/components/LoadingScreen'

const MEDAL = ['🥇', '🥈', '🥉']

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) return <span className="text-2xl">{MEDAL[rank - 1]}</span>
  return (
    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
      <span className="text-xs font-black text-gray-500">{rank}</span>
    </div>
  )
}

export default function RankingPage() {
  const { user, profile, loading, demoMode } = useAuth()
  const router = useRouter()
  const [studentRanking, setStudentRanking] = useState<StudentRanking[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (loading) return
    if (demoMode) return
    if (!user || !profile) { router.replace('/login'); return }
    if (profile.role === 'pending') { router.replace('/pending'); return }
  }, [loading, user, profile, router, demoMode])

  useEffect(() => {
    if (!profile || (!demoMode && !user)) return
    async function load() {
      const cached = await getCachedRankings()
      setStudentRanking(cached?.studentRanking ?? [])
      setUpdatedAt(cached?.updatedAt ?? null)
      setDataLoading(false)
    }
    load()
  }, [user, profile, demoMode])

  const myRank = studentRanking.find(s => s.uid === user?.uid)
  const top10 = studentRanking.slice(0, 10)

  if (loading || !profile) return <LoadingScreen />

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* 헤더 */}
        <div>
          <h1 className="text-xl font-black text-purple-dark">🏆 전국 TOP 10</h1>
          <p className="text-sm text-gray-400 mt-1">누적 순공시간 기준 전국 순위예요</p>
          <p className="text-xs text-gray-300 mt-1">
            * 매일 00시에 업데이트돼요
            {updatedAt && ` (마지막 업데이트 ${updatedAt.slice(5, 10).replace('-', '/')} ${updatedAt.slice(11, 16)})`}
          </p>
        </div>

        {dataLoading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="text-4xl animate-spin">⚙️</div>
            <p className="text-gray-400 text-sm">랭킹 계산 중...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 내 순위 (TOP 10 밖인 경우) */}
            {myRank && myRank.rank > 10 && (
              <div className="bg-purple-light/50 rounded-2xl px-4 py-3 border-2 border-purple-soft/30">
                <p className="text-xs text-purple-dark font-bold mb-1">나의 순위</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <RankBadge rank={myRank.rank} />
                    <div>
                      <p className="font-bold text-purple-dark text-sm">{myRank.name}</p>
                      <p className="text-xs text-gray-400">{myRank.school}</p>
                    </div>
                  </div>
                  <p className="font-black text-purple-dark text-sm">{formatMinutes(myRank.totalMinutes)}</p>
                </div>
              </div>
            )}

            {top10.length === 0 ? (
              <div className="text-center py-12 text-gray-300 text-sm">아직 데이터가 없어요</div>
            ) : (
              top10.map(s => {
                const isMe = s.uid === user?.uid
                return (
                  <div key={s.uid}
                    className={`rounded-3xl p-4 flex items-center justify-between transition-all ${
                      isMe
                        ? 'bg-gradient-to-r from-purple-light to-pink-light border-2 border-purple-soft/50 shadow-lg shadow-purple-200/30'
                        : s.rank <= 3
                        ? 'bg-white/90 shadow-lg shadow-purple-100/30 border border-purple-50'
                        : 'bg-white/60 shadow-md shadow-purple-100/20 border border-purple-50/50'
                    }`}>
                    <div className="flex items-center gap-3">
                      <RankBadge rank={s.rank} />
                      <div>
                        <div className="flex items-center gap-1">
                          <p className={`font-bold text-sm ${isMe ? 'text-purple-dark' : 'text-gray-700'}`}>
                            {s.name}
                          </p>
                          {isMe && <span className="text-xs bg-purple-soft text-white px-1.5 py-0.5 rounded-full">나</span>}
                        </div>
                        <p className="text-xs text-gray-400">{s.school}</p>
                      </div>
                    </div>
                    <p className={`font-black text-sm ${s.rank <= 3 ? 'text-purple-dark' : 'text-gray-600'}`}>
                      {formatMinutes(s.totalMinutes)}
                    </p>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
