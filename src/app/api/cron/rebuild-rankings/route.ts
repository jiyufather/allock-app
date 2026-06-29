// 매일 00시(KST)에 Vercel Cron이 호출하는 랭킹 집계 배치 — 전체 학생/학습기록을 한 번만 읽어 rankings/latest에 캐시
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { buildRankings } from '@/lib/rankings'
import { StudyLog, UserProfile } from '@/types'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: '인증이 필요해요' }, { status: 401 })
  }

  try {
    const db = adminDb()
    const [logsSnap, usersSnap] = await Promise.all([
      db.collection('studyLogs').get(),
      db.collection('users').where('role', '==', 'student').get(),
    ])
    const logs = logsSnap.docs.map(d => d.data() as StudyLog)
    const users = usersSnap.docs.map(d => d.data() as UserProfile)

    const { studentRanking, branchRanking } = buildRankings(logs, users)
    await db.collection('rankings').doc('latest').set({
      studentRanking,
      branchRanking,
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({
      ok: true,
      students: studentRanking.length,
      branches: branchRanking.length,
    })
  } catch (err) {
    console.error('rebuild-rankings error:', err)
    return NextResponse.json({ error: '집계 중 오류가 발생했어요' }, { status: 500 })
  }
}
