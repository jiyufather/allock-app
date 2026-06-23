'use client'
// 데모 모드 배너 — Firebase 연결 전 미리보기용

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { DEMO_STUDENTS, DEMO_ADMIN, DEMO_BRANCH_ADMIN } from '@/lib/demoData'
import { useRouter } from 'next/navigation'

const ROLES = [
  { uid: DEMO_STUDENTS[0].uid, label: '학생 (TOP)', icon: '🎓' },
  { uid: DEMO_STUDENTS[2].uid, label: '학생 (1위)', icon: '🥇' },
  { uid: DEMO_STUDENTS[5].uid, label: '학생 (중위)', icon: '📚' },
  { uid: DEMO_BRANCH_ADMIN.uid, label: '지점 관리자', icon: '🏫' },
  { uid: DEMO_ADMIN.uid, label: '본사 관리자', icon: '⚙️' },
]

export default function DemoBanner() {
  const { demoMode, profile, setDemoRole } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  if (!demoMode) return null

  function switchRole(uid: string) {
    setDemoRole(uid)
    setOpen(false)
    const isAdmin = uid === DEMO_ADMIN.uid || uid === DEMO_BRANCH_ADMIN.uid
    router.push(isAdmin ? '/admin' : '/dashboard')
  }

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-purple-soft to-pink-soft">
        <div className="max-w-lg mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">☁️</span>
            <span className="text-xs font-bold text-white">데모 모드 — Firebase 미연결</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/80">{profile?.name}</span>
            <button
              onClick={() => setOpen(!open)}
              className="text-xs bg-white/20 hover:bg-white/30 text-white font-bold px-2.5 py-1 rounded-full transition-all"
            >
              역할 변경
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed top-9 right-0 z-50 m-4 bg-white rounded-3xl shadow-xl shadow-purple-200/50 border border-purple-50 overflow-hidden w-48">
          {ROLES.map(r => (
            <button
              key={r.uid}
              onClick={() => switchRole(r.uid)}
              className={`w-full text-left px-4 py-3 text-sm font-medium flex items-center gap-2 hover:bg-purple-light/50 transition-colors ${
                profile?.uid === r.uid ? 'bg-purple-light text-purple-dark font-bold' : 'text-gray-600'
              }`}
            >
              <span>{r.icon}</span>
              {r.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
