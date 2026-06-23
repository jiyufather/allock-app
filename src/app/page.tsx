'use client'
// 루트 진입점 — 인증 상태에 따라 리다이렉트

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import LoadingScreen from '@/components/LoadingScreen'

export default function RootPage() {
  const { user, profile, loading, demoMode } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (demoMode) {
      if (!profile) return
      if (profile.role === 'super_admin' || profile.role === 'branch_admin') {
        router.replace('/admin')
      } else {
        router.replace('/dashboard')
      }
      return
    }
    if (!user || !profile) { router.replace('/login'); return }
    if (profile.role === 'pending') { router.replace('/pending'); return }
    if (profile.role === 'super_admin' || profile.role === 'branch_admin') { router.replace('/admin'); return }
    router.replace('/dashboard')
  }, [loading, user, profile, router, demoMode])

  return <LoadingScreen />
}
