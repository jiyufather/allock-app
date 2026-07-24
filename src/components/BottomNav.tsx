'use client'
// 학생용 네비게이션 — 모바일: 하단 탭바, lg+: 좌측 사이드바

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  { href: '/dashboard', label: '홈', icon: '🏠' },
  { href: '/log', label: '플래너 입력', icon: '✏️' },
  { href: '/timer', label: '스터디타이머', icon: '⏱️' },
  { href: '/goal', label: '목표 입력', icon: '🎯' },
  { href: '/ranking', label: '랭킹', icon: '🏆' },
  { href: '/report', label: '리포트', icon: '📋' },
  { href: '/leaderboard', label: '리더보드', icon: '📢' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <>
      {/* 모바일 / 태블릿 세로: 하단 탭바 */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
        <div className="bg-white/90 backdrop-blur-md border-t border-purple-100 shadow-[0_-4px_20px_rgba(201,184,255,0.2)]">
          <div className="flex">
            {items.map((item) => {
              const active = pathname === item.href
              return (
                <Link key={item.href} href={item.href}
                  className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-all">
                  <span className={`text-xl transition-transform ${active ? 'scale-125' : 'scale-100'}`}>
                    {item.icon}
                  </span>
                  <span className={`text-[10px] font-medium transition-colors leading-tight text-center ${
                    active ? 'text-purple-600' : 'text-gray-400'
                  }`}>
                    {item.label}
                  </span>
                  {active && <div className="w-1 h-1 rounded-full bg-purple-400" />}
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      {/* lg+: 좌측 사이드바 */}
      <nav className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-56 z-50
        bg-white/90 backdrop-blur-md border-r border-purple-100 shadow-[4px_0_20px_rgba(201,184,255,0.15)]">
        <div className="px-5 py-6 border-b border-purple-50">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔒</span>
            <div>
              <p className="text-xl font-black text-purple-dark leading-none">올락</p>
              <p className="text-[10px] font-bold text-purple-dark/50 leading-none mt-0.5">All Lock</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2 font-medium">잠그면, 오른다</p>
        </div>
        <div className="flex-1 py-4 space-y-1 px-3 overflow-y-auto">
          {items.map((item) => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-2xl transition-all ${
                  active
                    ? 'bg-purple-light/60 text-purple-dark'
                    : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                }`}>
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm font-bold">{item.label}</span>
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-400" />}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
