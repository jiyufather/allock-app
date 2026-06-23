// 올락 애플리케이션 전역 타입 정의
export type UserRole = 'pending' | 'student' | 'branch_admin' | 'super_admin'

export const UNIVERSITY_LINES = [
  '서울대·의대', '의학계열', '스카이', 'Top10',
  '건동홍(부산대,경북대)', '인서울', '수도권 상', '수도권 하',
] as const
export type UniversityLine = typeof UNIVERSITY_LINES[number]

export const GRADE_LEVELS = ['elementary', 'middle', 'high'] as const
export type GradeLevel = typeof GRADE_LEVELS[number]

export const GRADE_LEVEL_LABELS: Record<GradeLevel, string> = {
  elementary: '초등', middle: '중등', high: '고등',
}

export interface Grades {
  국어?: number
  수학?: number
  영어?: number
  탐구?: number
}

export interface Goal {
  dailyMinutes: number
  weeklyMinutes: number
}

export interface UserProfile {
  uid: string
  email: string
  name: string
  school: string
  role: UserRole
  studentCode?: string
  gradeLevel?: GradeLevel
  targetLine?: UniversityLine
  targetUniversity?: string
  grades?: {
    내신: Grades
    모의고사: Grades
  }
  goal?: Goal
  weeklySchedule?: string[][]   // [슬롯 인덱스][요일 인덱스] — 주간 시간표
  summerStart?: string           // 개별 썸머스쿨 시작일 (미설정 시 전역 기본값 사용)
  summerEnd?: string             // 개별 썸머스쿨 종료일 (미설정 시 시작일+4주)
  createdAt: string
}

export interface StudyPlan {
  contents: string[]
  plannedMinutes: number
}

export interface Deduction {
  slot: string      // 감점 대상 시간 슬롯 (예: "09:30")
  minutes: number
  reason: string
  by: string         // 처리한 관리자 이름
  at: string         // ISO 시각
}

export interface StudyLog {
  id: string
  userId: string
  userName: string
  userSchool: string
  date: string
  week: number
  plan: Partial<Record<Subject, StudyPlan>>
  scheduleSlots?: Partial<Record<string, Subject>>  // 시간 슬롯 → 과목 (시간대별 감점용)
  deductions?: Deduction[]
  plannedTotalMinutes: number
  subjects: Partial<Record<Subject, number>>
  totalMinutes: number
  status: 'planned' | 'approved'
  approvedBy?: string
  approvedAt?: string
  mood?: string
  resolution?: string
  createdAt: string
}

export const SUBJECTS = ['국어', '수학', '영어', '탐구', '기타'] as const
export type Subject = typeof SUBJECTS[number]

export const SUBJECT_COLORS: Record<Subject, string> = {
  국어: '#FFB3C6',
  수학: '#C9B8FF',
  영어: '#B8F0E6',
  탐구: '#FFD5B8',
  기타: '#FFF4B8',
}

export interface StudentCode {
  code: string
  branchName: string
  usedBy?: string
  usedAt?: string
  createdAt: string
}

export interface LockStudyDaySchedule {
  branchName: string
  day: string                       // 월~일
  entries: Record<string, string[]> // 학생 uid → 슬롯별 활동 배열
  updatedAt: string
}

export interface LockStudySupervisors {
  branchName: string
  byDay: Record<string, string>     // 요일 → 담당 조교/선생님 이름
  updatedAt: string
}
