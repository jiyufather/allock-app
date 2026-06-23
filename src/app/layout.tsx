// 올락 앱 루트 레이아웃
import type { Metadata, Viewport } from 'next'
import { Noto_Sans_KR } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import DemoBanner from '@/components/DemoBanner'

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  variable: '--font-noto',
})

export const metadata: Metadata = {
  title: '올락 — 올여름, 성적을 잠가라',
  description: '에이닷 썸머스쿨 순공 관리 앱',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#C9B8FF',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={notoSansKr.variable}>
      <body className="min-h-screen bg-gradient-to-br from-purple-light via-white to-pink-light">
        <AuthProvider>
          <DemoBanner />
          <div className="pt-9">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
