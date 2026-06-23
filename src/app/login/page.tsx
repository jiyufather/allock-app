'use client'
// 로그인 페이지

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { toLoginEmail } from '@/lib/auth'

export default function LoginPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user || !profile) return
    if (profile.role === 'pending') router.replace('/pending')
    else if (profile.role === 'super_admin' || profile.role === 'branch_admin') router.replace('/admin')
    else router.replace('/dashboard')
  }, [loading, user, profile, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const loginEmail = id.includes('@') ? id.trim().toLowerCase() : toLoginEmail(id)
      await signInWithEmailAndPassword(auth, loginEmail, password)
    } catch {
      setError('아이디 또는 비밀번호가 올바르지 않아요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        {/* 로고 */}
        <div className="text-center space-y-2">
          <div className="text-6xl">☁️</div>
          <h1 className="text-3xl font-black text-purple-dark tracking-tight">올락</h1>
          <p className="text-sm text-gray-400 font-medium">올여름, 성적을 잠가라</p>
        </div>

        {/* 폼 */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-xl shadow-purple-100/50 border border-purple-50 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-600">아이디</label>
              <input
                type="text"
                value={id}
                onChange={e => setId(e.target.value)}
                placeholder="아이디"
                required
                className="w-full px-4 py-3 rounded-2xl border-2 border-purple-light bg-purple-light/30 focus:border-purple-soft focus:outline-none focus:bg-white transition-all text-sm placeholder:text-gray-300"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-600">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호"
                required
                className="w-full px-4 py-3 rounded-2xl border-2 border-purple-light bg-purple-light/30 focus:border-purple-soft focus:outline-none focus:bg-white transition-all text-sm placeholder:text-gray-300"
              />
            </div>

            {error && (
              <div className="bg-pink-light text-pink-dark text-sm rounded-2xl px-4 py-3 font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-soft to-pink-soft hover:from-purple-dark hover:to-pink-dark transition-all shadow-lg shadow-purple-200/50 disabled:opacity-60"
            >
              {submitting ? '로그인 중...' : '로그인'}
            </button>

            <p className="text-center text-xs text-gray-400">
              아이디나 비밀번호를 잊으셨다면 다니는 지점에 문의해주세요.
            </p>
          </form>
        </div>

        <p className="text-center text-sm text-gray-400">
          아직 계정이 없다면?{' '}
          <Link href="/register" className="text-purple-dark font-bold hover:underline">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  )
}
