// Firestore CRUD 유틸리티
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection,
  query, where, getDocs, orderBy,
} from 'firebase/firestore'
import { db } from './firebase'
import {
  UserProfile, UserRole, StudyLog, StudyPlan, Goal, SUBJECTS, Subject, StudentCode,
  LockStudyDaySchedule, LockStudySupervisors, Deduction,
} from '@/types'
import { getWeekFromDate } from './config'
import { computeNetSubjects } from './deductions'
import { scheduleToFirestore, scheduleFromFirestore } from './schedule'
import {
  DEMO_STUDENTS, DEMO_PENDING, DEMO_LOGS, DEMO_ADMIN, DEMO_BRANCH_ADMIN,
  DEMO_PENDING_PLANS,
} from './demoData'

export const DEMO_MODE =
  typeof window !== 'undefined' &&
  (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY === '')

// ─── 사용자 ─────────────────────────────────────────────────────

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (DEMO_MODE) {
    return (
      [...DEMO_STUDENTS, ...DEMO_PENDING, DEMO_ADMIN, DEMO_BRANCH_ADMIN].find(u => u.uid === uid) ?? null
    )
  }
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  const data = snap.data() as UserProfile
  if (data.weeklySchedule) {
    data.weeklySchedule = scheduleFromFirestore(data.weeklySchedule as unknown as Record<string, string[]>)
  }
  return data
}

export async function createUserProfile(uid: string, data: Omit<UserProfile, 'uid' | 'createdAt'>) {
  if (DEMO_MODE) return
  await setDoc(doc(db, 'users', uid), {
    ...data,
    uid,
    createdAt: new Date().toISOString(),
  })
}

export async function updateUserRole(uid: string, role: UserRole) {
  if (DEMO_MODE) return
  await updateDoc(doc(db, 'users', uid), { role })
}

export async function updateUserGoal(uid: string, goal: Goal) {
  if (DEMO_MODE) return
  await updateDoc(doc(db, 'users', uid), { goal })
}

export async function updateUserTargetGoal(
  uid: string,
  updates: Partial<Pick<UserProfile, 'gradeLevel' | 'targetLine' | 'targetUniversity' | 'goal' | 'grades' | 'weeklySchedule'>>,
) {
  if (DEMO_MODE) return
  const payload: Record<string, unknown> = { ...updates }
  if (updates.weeklySchedule) payload.weeklySchedule = scheduleToFirestore(updates.weeklySchedule)
  await updateDoc(doc(db, 'users', uid), payload)
}

/** 학생 개별 썸머스쿨 기간 설정 */
export async function updateStudentSummerDates(uid: string, summerStart: string, summerEnd: string) {
  if (DEMO_MODE) return
  await updateDoc(doc(db, 'users', uid), { summerStart, summerEnd })
}

/** 복수 학생 썸머스쿨 기간 일괄 설정 */
export async function bulkSetSummerDates(uids: string[], summerStart: string, summerEnd: string) {
  if (DEMO_MODE) return
  await Promise.all(uids.map(uid =>
    updateDoc(doc(db, 'users', uid), { summerStart, summerEnd })
  ))
}

export async function getPendingUsers(): Promise<UserProfile[]> {
  if (DEMO_MODE) return DEMO_PENDING
  const q = query(collection(db, 'users'), where('role', '==', 'pending'))
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as UserProfile)
}

export async function getAllStudents(school?: string): Promise<UserProfile[]> {
  if (DEMO_MODE) {
    const all = [...DEMO_STUDENTS, ...DEMO_PENDING]
    return school ? all.filter(u => u.school === school) : all
  }
  const q = query(
    collection(db, 'users'),
    where('role', 'in', ['student', 'pending']),
    orderBy('createdAt', 'desc'),
  )
  const snap = await getDocs(q)
  const all = snap.docs.map(d => d.data() as UserProfile)
  return school ? all.filter(u => u.school === school) : all
}

// ─── 공부 계획 (학생) ────────────────────────────────────────────

export async function submitStudyPlan(
  userId: string,
  userName: string,
  userSchool: string,
  date: string,
  plan: Partial<Record<Subject, StudyPlan>>,
  scheduleSlots: Partial<Record<string, Subject>>,
  mood?: string,
  resolution?: string,
) {
  if (DEMO_MODE) return
  const logId = `${userId}_${date}`
  const plannedTotalMinutes = Object.values(plan).reduce((s, p) => s + (p?.plannedMinutes ?? 0), 0)
  await setDoc(doc(db, 'studyLogs', logId), {
    id: logId,
    userId,
    userName,
    userSchool,
    date,
    week: getWeekFromDate(date),
    plan,
    scheduleSlots,
    deductions: [],
    plannedTotalMinutes,
    subjects: {},
    totalMinutes: 0,
    status: 'planned',
    mood: mood ?? '',
    resolution: resolution ?? '',
    createdAt: new Date().toISOString(),
  })
}

// ─── 승인 (관리자) ────────────────────────────────────────────────

export async function approveStudyLog(
  logId: string,
  actualSubjects: Partial<Record<Subject, number>>,
  approvedByName: string,
) {
  if (DEMO_MODE) return
  const totalMinutes = Object.values(actualSubjects).reduce((s, v) => s + (v ?? 0), 0)
  await updateDoc(doc(db, 'studyLogs', logId), {
    subjects: actualSubjects,
    totalMinutes,
    status: 'approved',
    approvedBy: approvedByName,
    approvedAt: new Date().toISOString(),
  })
}

export async function addDeduction(logId: string, deduction: Deduction) {
  if (DEMO_MODE) return
  const ref = doc(db, 'studyLogs', logId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const log = snap.data() as StudyLog
  const deductions = [...(log.deductions ?? []), deduction]
  const subjects = computeNetSubjects(log.scheduleSlots, deductions)
  const totalMinutes = Object.values(subjects).reduce((s, v) => s + (v ?? 0), 0)
  await updateDoc(ref, { deductions, subjects, totalMinutes })
}

export async function getPendingApprovals(date: string, school?: string): Promise<StudyLog[]> {
  if (DEMO_MODE) {
    const all = [...DEMO_PENDING_PLANS, ...DEMO_LOGS]
    const forDate = all.filter(l => l.date === date)
    return school ? forDate.filter(l => l.userSchool === school) : forDate
  }
  const q = query(collection(db, 'studyLogs'), where('date', '==', date))
  const snap = await getDocs(q)
  let logs = snap.docs.map(d => d.data() as StudyLog)
  if (school) logs = logs.filter(l => l.userSchool === school)
  return logs
}

// ─── 학생 본인 조회 ──────────────────────────────────────────────

export async function getMyLogs(userId: string): Promise<StudyLog[]> {
  if (DEMO_MODE) {
    return [...DEMO_LOGS, ...DEMO_PENDING_PLANS].filter(l => l.userId === userId)
  }
  const q = query(
    collection(db, 'studyLogs'),
    where('userId', '==', userId),
    orderBy('date', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as StudyLog)
}

export async function getLogForDate(userId: string, date: string): Promise<StudyLog | null> {
  if (DEMO_MODE) {
    return [...DEMO_LOGS, ...DEMO_PENDING_PLANS].find(l => l.userId === userId && l.date === date) ?? null
  }
  const snap = await getDoc(doc(db, 'studyLogs', `${userId}_${date}`))
  return snap.exists() ? (snap.data() as StudyLog) : null
}

export async function getAllLogs(school?: string): Promise<StudyLog[]> {
  if (DEMO_MODE) {
    const logs = DEMO_LOGS.filter(l => l.status === 'approved')
    return school ? logs.filter(l => l.userSchool === school) : logs
  }
  const snap = await getDocs(collection(db, 'studyLogs'))
  let logs = snap.docs.map(d => d.data() as StudyLog).filter(l => l.status === 'approved')
  if (school) logs = logs.filter(l => l.userSchool === school)
  return logs
}

// ─── 랭킹 ────────────────────────────────────────────────────────

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

// ─── 공개 리더보드 ────────────────────────────────────────────────

export interface DailyEntry {
  userId: string
  userName: string
  userSchool: string
  totalMinutes: number
  rank: number
}

export async function getDailyTop(date: string, topN = 5): Promise<DailyEntry[]> {
  if (DEMO_MODE) {
    const allDates = [...new Set(DEMO_LOGS.map(l => l.date))].sort()
    const targetDate = allDates.includes(date) ? date : allDates[allDates.length - 1]
    return DEMO_LOGS
      .filter(l => l.date === targetDate && l.status === 'approved')
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, topN)
      .map((l, i) => ({ userId: l.userId, userName: l.userName, userSchool: l.userSchool, totalMinutes: l.totalMinutes, rank: i + 1 }))
  }
  const q = query(collection(db, 'studyLogs'), where('date', '==', date), where('status', '==', 'approved'))
  const snap = await getDocs(q)
  return snap.docs
    .map(d => d.data() as StudyLog)
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, topN)
    .map((d, i) => ({ userId: d.userId, userName: d.userName, userSchool: d.userSchool, totalMinutes: d.totalMinutes, rank: i + 1 }))
}

export async function getWeeklyTop(week: number, topN = 10): Promise<DailyEntry[]> {
  if (DEMO_MODE) {
    const logs = DEMO_LOGS.filter(l => (l.week === week || l.week <= 2) && l.status === 'approved')
    const agg: Record<string, DailyEntry> = {}
    for (const log of logs) {
      if (!agg[log.userId]) agg[log.userId] = { userId: log.userId, userName: log.userName, userSchool: log.userSchool, totalMinutes: 0, rank: 0 }
      agg[log.userId].totalMinutes += log.totalMinutes
    }
    return Object.values(agg).sort((a, b) => b.totalMinutes - a.totalMinutes).slice(0, topN).map((e, i) => ({ ...e, rank: i + 1 }))
  }
  const q = query(collection(db, 'studyLogs'), where('week', '==', week), where('status', '==', 'approved'))
  const snap = await getDocs(q)
  const logs = snap.docs.map(d => d.data() as StudyLog)
  const agg: Record<string, DailyEntry> = {}
  for (const log of logs) {
    if (!agg[log.userId]) agg[log.userId] = { userId: log.userId, userName: log.userName, userSchool: log.userSchool, totalMinutes: 0, rank: 0 }
    agg[log.userId].totalMinutes += log.totalMinutes
  }
  return Object.values(agg).sort((a, b) => b.totalMinutes - a.totalMinutes).slice(0, topN).map((e, i) => ({ ...e, rank: i + 1 }))
}

// ─── 리포트 ──────────────────────────────────────────────────────

export interface WeeklyReport {
  week: number
  subjectTotals: Record<string, number>
  subjectPlannedTotals: Record<string, number>
  subjectContents: Record<string, string[]>
  dailyTotals: Record<string, number>
  totalMinutes: number
  plannedTotalMinutes: number
  goalAchievementRate: number
  daysStudied: number
}

export interface StudentReport {
  profile: UserProfile
  weeks: WeeklyReport[]
  grandTotal: number
  grandPlannedTotal: number
  subjectGrandTotals: Record<string, number>
  subjectGrandPlannedTotals: Record<string, number>
  totalDaysStudied: number
  totalGoalAchievementRate: number
}

const DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

function dayKey(dateStr: string): string {
  const d = new Date(dateStr)
  return DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]
}

function buildReport(profile: UserProfile, logs: StudyLog[], totalWeeks: number): StudentReport {
  const approvedLogs = logs.filter(l => l.status === 'approved')

  const weeks: WeeklyReport[] = Array.from({ length: totalWeeks }, (_, i) => ({
    week: i + 1,
    subjectTotals: Object.fromEntries(SUBJECTS.map(s => [s, 0])),
    subjectPlannedTotals: Object.fromEntries(SUBJECTS.map(s => [s, 0])),
    subjectContents: Object.fromEntries(SUBJECTS.map(s => [s, [] as string[]])),
    dailyTotals: { 월: 0, 화: 0, 수: 0, 목: 0, 금: 0, 토: 0, 일: 0 },
    totalMinutes: 0,
    plannedTotalMinutes: 0,
    goalAchievementRate: 0,
    daysStudied: 0,
  }))

  for (const log of approvedLogs) {
    const w = log.week - 1
    if (w < 0 || w >= totalWeeks) continue
    const day = dayKey(log.date)
    weeks[w].dailyTotals[day] = (weeks[w].dailyTotals[day] ?? 0) + log.totalMinutes
    weeks[w].totalMinutes += log.totalMinutes
    weeks[w].plannedTotalMinutes += log.plannedTotalMinutes
    weeks[w].daysStudied++

    for (const sub of SUBJECTS) {
      weeks[w].subjectTotals[sub] = (weeks[w].subjectTotals[sub] ?? 0) + (log.subjects[sub] ?? 0)
      weeks[w].subjectPlannedTotals[sub] = (weeks[w].subjectPlannedTotals[sub] ?? 0) + (log.plan[sub]?.plannedMinutes ?? 0)
      const subContents = log.plan[sub]?.contents ?? []
      for (const c of subContents) {
        if (!weeks[w].subjectContents[sub].includes(c)) {
          weeks[w].subjectContents[sub].push(c)
        }
      }
    }
  }

  const weeklyGoal = profile.goal?.weeklyMinutes ?? 0
  const weeksWithGoal = weeks.map(w => ({
    ...w,
    goalAchievementRate: weeklyGoal > 0 ? Math.min(100, Math.round((w.totalMinutes / weeklyGoal) * 100)) : 0,
  }))

  const subjectGrandTotals = Object.fromEntries(
    SUBJECTS.map(sub => [sub, weeksWithGoal.reduce((s, w) => s + (w.subjectTotals[sub] ?? 0), 0)])
  )
  const subjectGrandPlannedTotals = Object.fromEntries(
    SUBJECTS.map(sub => [sub, weeksWithGoal.reduce((s, w) => s + (w.subjectPlannedTotals[sub] ?? 0), 0)])
  )
  const grandTotal = weeksWithGoal.reduce((s, w) => s + w.totalMinutes, 0)
  const grandPlannedTotal = weeksWithGoal.reduce((s, w) => s + w.plannedTotalMinutes, 0)
  const totalDaysStudied = weeksWithGoal.reduce((s, w) => s + w.daysStudied, 0)
  const totalGoalMinutes = weeklyGoal * totalWeeks
  const totalGoalAchievementRate = totalGoalMinutes > 0
    ? Math.min(100, Math.round((grandTotal / totalGoalMinutes) * 100))
    : 0

  return { profile, weeks: weeksWithGoal, grandTotal, grandPlannedTotal, subjectGrandTotals, subjectGrandPlannedTotals, totalDaysStudied, totalGoalAchievementRate }
}

// ─── 학생코드 ─────────────────────────────────────────────────────

const DEMO_STUDENT_CODES: StudentCode[] = [
  { code: 'OLLAK-001', branchName: '에이닷 강남지점', createdAt: '2025-01-01T00:00:00.000Z' },
  { code: 'OLLAK-002', branchName: '에이닷 강남지점', usedBy: 'demo1', usedAt: '2025-07-01T00:00:00.000Z', createdAt: '2025-01-01T00:00:00.000Z' },
  { code: 'OLLAK-003', branchName: '에이닷 서초지점', createdAt: '2025-01-01T00:00:00.000Z' },
]

export async function getStudentCodes(): Promise<StudentCode[]> {
  if (DEMO_MODE) return DEMO_STUDENT_CODES
  const snap = await getDocs(collection(db, 'studentCodes'))
  return snap.docs.map(d => d.data() as StudentCode)
}

export async function addStudentCode(code: string, branchName: string): Promise<void> {
  if (DEMO_MODE) return
  const entry: StudentCode = { code, branchName, createdAt: new Date().toISOString() }
  await setDoc(doc(db, 'studentCodes', code), entry)
}

export async function deleteStudentCode(code: string): Promise<void> {
  if (DEMO_MODE) return
  await deleteDoc(doc(db, 'studentCodes', code))
}

export async function bulkDeleteStudentCodes(codes: string[]): Promise<void> {
  if (DEMO_MODE) return
  await Promise.all(codes.map(code => deleteStudentCode(code)))
}

export async function bulkAddStudentCodes(entries: Array<{ code: string; branchName: string }>): Promise<void> {
  if (DEMO_MODE) return
  await Promise.all(entries.map(e => addStudentCode(e.code, e.branchName)))
}

export async function validateStudentCode(code: string): Promise<StudentCode | null> {
  if (DEMO_MODE) {
    if (!code.trim()) return null
    return { code, branchName: '에이닷 강남지점', createdAt: new Date().toISOString() }
  }
  const snap = await getDoc(doc(db, 'studentCodes', code))
  if (!snap.exists()) return null
  const entry = snap.data() as StudentCode
  return entry.usedBy ? null : entry
}

export async function markCodeUsed(code: string, uid: string): Promise<void> {
  if (DEMO_MODE) return
  await updateDoc(doc(db, 'studentCodes', code), { usedBy: uid, usedAt: new Date().toISOString() })
}

// ─── 락스터디 관리 ─────────────────────────────────────────────────

export async function getLockStudySchedule(branchName: string, day: string): Promise<LockStudyDaySchedule | null> {
  if (DEMO_MODE) return null
  const snap = await getDoc(doc(db, 'lockStudySchedules', `${branchName}_${day}`))
  return snap.exists() ? (snap.data() as LockStudyDaySchedule) : null
}

export async function saveLockStudySchedule(
  branchName: string, day: string, entries: Record<string, string[]>,
): Promise<void> {
  if (DEMO_MODE) return
  await setDoc(doc(db, 'lockStudySchedules', `${branchName}_${day}`), {
    branchName, day, entries, updatedAt: new Date().toISOString(),
  })
}

export async function getLockStudySupervisors(branchName: string): Promise<LockStudySupervisors | null> {
  if (DEMO_MODE) return null
  const snap = await getDoc(doc(db, 'lockStudySupervisors', branchName))
  return snap.exists() ? (snap.data() as LockStudySupervisors) : null
}

export async function saveLockStudySupervisors(branchName: string, byDay: Record<string, string>): Promise<void> {
  if (DEMO_MODE) return
  await setDoc(doc(db, 'lockStudySupervisors', branchName), {
    branchName, byDay, updatedAt: new Date().toISOString(),
  })
}

export async function getStudentReport(userId: string, totalWeeks = 4): Promise<StudentReport | null> {
  if (DEMO_MODE) {
    const profile = await getUserProfile(userId)
    if (!profile) return null
    const logs = DEMO_LOGS.filter(l => l.userId === userId).sort((a, b) => a.date.localeCompare(b.date))
    return buildReport(profile, logs, totalWeeks)
  }
  const [profile, logsSnap] = await Promise.all([
    getUserProfile(userId),
    getDocs(query(collection(db, 'studyLogs'), where('userId', '==', userId), orderBy('date', 'asc'))),
  ])
  if (!profile) return null
  const logs = logsSnap.docs.map(d => d.data() as StudyLog)
  return buildReport(profile, logs, totalWeeks)
}
