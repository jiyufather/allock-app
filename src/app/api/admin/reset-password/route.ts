// 관리자가 학생 비밀번호를 직접 초기화하는 서버 API (Admin SDK 사용, 이메일 불필요)
import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

function generateTempPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') ?? ''
    const idToken = authHeader.replace('Bearer ', '')
    if (!idToken) return NextResponse.json({ error: '인증이 필요해요' }, { status: 401 })

    const decoded = await adminAuth().verifyIdToken(idToken)
    const callerSnap = await adminDb().collection('users').doc(decoded.uid).get()
    const caller = callerSnap.data()
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'branch_admin')) {
      return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
    }

    const { targetUid } = await request.json()
    if (!targetUid || typeof targetUid !== 'string') {
      return NextResponse.json({ error: 'targetUid가 필요해요' }, { status: 400 })
    }

    const targetSnap = await adminDb().collection('users').doc(targetUid).get()
    const target = targetSnap.data()
    if (!target) return NextResponse.json({ error: '학생을 찾을 수 없어요' }, { status: 404 })

    if (caller.role === 'branch_admin' && target.school !== caller.school) {
      return NextResponse.json({ error: '다른 지점 학생은 초기화할 수 없어요' }, { status: 403 })
    }

    const newPassword = generateTempPassword()
    await adminAuth().updateUser(targetUid, { password: newPassword })

    return NextResponse.json({ password: newPassword })
  } catch (err) {
    console.error('reset-password error:', err)
    return NextResponse.json({ error: '처리 중 오류가 발생했어요' }, { status: 500 })
  }
}
