// 학습 기록 기반 학생/지점 랭킹 계산 — Firebase 의존성 없는 순수 함수 (클라이언트·서버 양쪽에서 안전하게 사용)
import { StudyLog, UserProfile } from '@/types'

export interface StudentRanking {
  uid: string
  name: string
  school: string
  totalMinutes: number
  rank: number
}

export interface BranchRanking {
  school: string
  totalMinutes: number
  studentCount: number
  avgMinutes: number
  rank: number
}

export interface CachedRankings {
  studentRanking: StudentRanking[]
  branchRanking: BranchRanking[]
  updatedAt: string
}

export function buildRankings(logs: StudyLog[], users: UserProfile[]) {
  const approvedLogs = logs.filter(l => l.status === 'approved')

  const userTotals: Record<string, { name: string; school: string; total: number }> = {}
  for (const log of approvedLogs) {
    if (!userTotals[log.userId]) {
      userTotals[log.userId] = { name: log.userName, school: log.userSchool, total: 0 }
    }
    userTotals[log.userId].total += log.totalMinutes
  }

  const studentRanking: StudentRanking[] = Object.entries(userTotals)
    .map(([uid, v]) => ({ uid, name: v.name, school: v.school, totalMinutes: v.total, rank: 0 }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .map((s, i) => ({ ...s, rank: i + 1 }))

  const branchTotals: Record<string, { total: number; count: number }> = {}
  for (const user of users) {
    if (user.role !== 'student') continue
    if (!branchTotals[user.school]) branchTotals[user.school] = { total: 0, count: 0 }
    branchTotals[user.school].count++
    const userLogs = approvedLogs.filter(l => l.userId === user.uid)
    branchTotals[user.school].total += userLogs.reduce((s, l) => s + l.totalMinutes, 0)
  }

  const branchRanking: BranchRanking[] = Object.entries(branchTotals)
    .map(([school, v]) => ({
      school,
      totalMinutes: v.total,
      studentCount: v.count,
      avgMinutes: v.count > 0 ? Math.round(v.total / v.count) : 0,
      rank: 0,
    }))
    .sort((a, b) => b.avgMinutes - a.avgMinutes)
    .map((b, i) => ({ ...b, rank: i + 1 }))

  return { studentRanking, branchRanking }
}
