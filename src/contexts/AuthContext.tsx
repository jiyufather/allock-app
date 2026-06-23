'use client'
// 사용자 인증 상태를 관리하는 Context Provider

import { createContext, useContext, useEffect, useState } from 'react'
import { type User } from 'firebase/auth'
import { getUserProfile, DEMO_MODE } from '@/lib/firestore'
import { UserProfile } from '@/types'
import { DEMO_STUDENTS, DEMO_ADMIN, DEMO_BRANCH_ADMIN } from '@/lib/demoData'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  demoMode: boolean
  setDemoRole: (uid: string) => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  demoMode: false,
  setDemoRole: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  function setDemoRole(uid: string) {
    const target = [...DEMO_STUDENTS, DEMO_ADMIN, DEMO_BRANCH_ADMIN].find(u => u.uid === uid)
    if (target) setProfile(target)
  }

  const refreshProfile = async () => {
    if (DEMO_MODE || !user) return
    const p = await getUserProfile(user.uid)
    setProfile(p)
  }

  useEffect(() => {
    // 데모 모드: Firebase 호출 없이 첫 번째 학생으로 자동 로그인
    if (DEMO_MODE) {
      setProfile(DEMO_STUDENTS[0])
      setLoading(false)
      return
    }

    // 실제 Firebase Auth
    import('@/lib/firebase').then(({ auth }) => {
      import('firebase/auth').then(({ onAuthStateChanged }) => {
        const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
          setUser(firebaseUser)
          if (firebaseUser) {
            const p = await getUserProfile(firebaseUser.uid)
            setProfile(p)
          } else {
            setProfile(null)
          }
          setLoading(false)
        })
        return () => unsub()
      })
    })
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile, demoMode: DEMO_MODE, setDemoRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
