'use client'
// 관리자 승인 대기 페이지

import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function PendingPage() {
  const { profile, loading, refreshProfile } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!profile) {
      router.replace('/login')
      return
    }
    if (profile.role !== 'pending') {
      if (profile.role === 'super_admin' || profile.role === 'branch_admin') {
        router.replace('/admin')
      } else {
        router.replace('/dashboard')
      }
    }
  }, [loading, profile, router])

  async function handleLogout() {
    await signOut(auth)
    router.replace('/login')
  }

  async function handleRefresh() {
    await refreshProfile()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="text-7xl animate-bounce">⏳</div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black text-purple-dark">승인 대기 중이에요</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            {profile?.name}님의 가입 신청을 받았어요.<br />
            관리자가 승인하면 바로 시작할 수 있어요.
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-xl shadow-purple-100/50 border border-purple-50 space-y-3">
          <div className="flex items-center gap-3 bg-purple-light/50 rounded-2xl px-4 py-3">
            <span className="text-2xl">🏫</span>
            <div className="text-left">
              <p className="text-xs text-gray-400">학교</p>
              <p className="font-bold text-purple-dark text-sm">{profile?.school}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-pink-light/50 rounded-2xl px-4 py-3">
            <span className="text-2xl">🎯</span>
            <div className="text-left">
              <p className="text-xs text-gray-400">목표 대학</p>
              <p className="font-bold text-pink-dark text-sm">{profile?.targetUniversity ?? '미설정'}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleRefresh}
            className="w-full py-3.5 rounded-2xl font-bold text-purple-dark bg-purple-light hover:bg-purple-soft/40 transition-all"
          >
            승인 여부 확인하기
          </button>
          <button
            onClick={handleLogout}
            className="w-full py-3 rounded-2xl font-medium text-gray-400 bg-white/50 hover:bg-gray-100 transition-all text-sm"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  )
}
