// 데모 모드용 가상 학생 및 순공 데이터 (실제 윈터스쿨 데이터 기반)
import { UserProfile, StudyLog, StudyPlan, Subject, UniversityLine, GradeLevel } from '@/types'
import { toDateStr, getWeekFromDate } from './config'

function dateOf(week: number, dayIndex: number): string {
  const start = new Date('2026-07-07')
  const d = new Date(start)
  d.setDate(d.getDate() + (week - 1) * 7 + dayIndex)
  return d.toISOString().split('T')[0]
}

export const DEMO_STUDENTS: UserProfile[] = [
  {
    uid: 'demo-s1', email: 's1@demo.kr', name: '김에이', school: '에이닷 강남지점',
    role: 'student', gradeLevel: 'high', targetLine: '스카이', targetUniversity: '연세대학교',
    grades: { 내신: { 국어: 2.6, 수학: 3.1, 영어: 1.8, 탐구: 2.4 }, 모의고사: { 국어: 3, 수학: 4, 영어: 2, 탐구: 3 } },
    goal: { dailyMinutes: 300, weeklyMinutes: 1500 },
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    uid: 'demo-s2', email: 's2@demo.kr', name: '박서준', school: '에이닷 강남지점',
    role: 'student', gradeLevel: 'high', targetLine: 'Top10', targetUniversity: '고려대학교',
    grades: { 내신: { 국어: 2.0, 수학: 2.3, 영어: 2.5, 탐구: 2.8 }, 모의고사: { 국어: 2, 수학: 3, 영어: 3, 탐구: 3 } },
    goal: { dailyMinutes: 270, weeklyMinutes: 1350 },
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    uid: 'demo-s3', email: 's3@demo.kr', name: '이지은', school: '에이닷 서초지점',
    role: 'student', gradeLevel: 'high', targetLine: '서울대·의대', targetUniversity: '서울대학교',
    grades: { 내신: { 국어: 1.8, 수학: 1.5, 영어: 1.6, 탐구: 1.9 }, 모의고사: { 국어: 1, 수학: 2, 영어: 1, 탐구: 2 } },
    goal: { dailyMinutes: 360, weeklyMinutes: 1800 },
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    uid: 'demo-s4', email: 's4@demo.kr', name: '최민준', school: '에이닷 서초지점',
    role: 'student', gradeLevel: 'high', targetLine: '인서울', targetUniversity: '성균관대학교',
    grades: { 내신: { 국어: 3.0, 수학: 2.8, 영어: 3.2, 탐구: 3.5 }, 모의고사: { 국어: 3, 수학: 3, 영어: 4, 탐구: 4 } },
    goal: { dailyMinutes: 240, weeklyMinutes: 1200 },
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    uid: 'demo-s5', email: 's5@demo.kr', name: '정수아', school: '에이닷 마포지점',
    role: 'student', gradeLevel: 'middle', targetLine: '인서울', targetUniversity: '한양대학교',
    grades: { 내신: { 국어: 2.9, 수학: 3.4, 영어: 2.7, 탐구: 3.0 }, 모의고사: { 국어: 3, 수학: 4, 영어: 3, 탐구: 4 } },
    goal: { dailyMinutes: 270, weeklyMinutes: 1350 },
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    uid: 'demo-s6', email: 's6@demo.kr', name: '한도윤', school: '에이닷 강남지점',
    role: 'student', gradeLevel: 'high', targetLine: '스카이', targetUniversity: '이화여자대학교',
    grades: { 내신: { 국어: 2.4, 수학: 2.9, 영어: 2.1, 탐구: 2.6 }, 모의고사: { 국어: 2, 수학: 3, 영어: 2, 탐구: 3 } },
    goal: { dailyMinutes: 270, weeklyMinutes: 1350 },
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    uid: 'demo-s7', email: 's7@demo.kr', name: '오서윤', school: '에이닷 마포지점',
    role: 'student', gradeLevel: 'middle', targetLine: '건동홍(부산대,경북대)', targetUniversity: '중앙대학교',
    grades: { 내신: { 국어: 3.2, 수학: 3.8, 영어: 3.0, 탐구: 3.4 }, 모의고사: { 국어: 4, 수학: 4, 영어: 3, 탐구: 4 } },
    goal: { dailyMinutes: 210, weeklyMinutes: 1050 },
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    uid: 'demo-s8', email: 's8@demo.kr', name: '윤하람', school: '에이닷 서초지점',
    role: 'student', gradeLevel: 'high', targetLine: '스카이', targetUniversity: '연세대학교',
    grades: { 내신: { 국어: 2.1, 수학: 2.0, 영어: 1.9, 탐구: 2.3 }, 모의고사: { 국어: 2, 수학: 2, 영어: 2, 탐구: 2 } },
    goal: { dailyMinutes: 300, weeklyMinutes: 1500 },
    createdAt: '2026-07-01T00:00:00.000Z',
  },
]

export const DEMO_PENDING: UserProfile[] = [
  {
    uid: 'demo-p1', email: 'new1@demo.kr', name: '강지호', school: '에이닷 강남지점',
    role: 'pending', targetUniversity: '고려대학교',
    grades: { 내신: { 국어: 3.1, 수학: 2.9, 영어: 3.3, 탐구: 3.0 }, 모의고사: { 국어: 3, 수학: 3, 영어: 4, 탐구: 3 } },
    createdAt: '2026-07-05T10:00:00.000Z',
  },
  {
    uid: 'demo-p2', email: 'new2@demo.kr', name: '송유진', school: '에이닷 마포지점',
    role: 'pending', targetUniversity: '서강대학교',
    grades: { 내신: { 국어: 2.5, 수학: 2.7, 영어: 2.3, 탐구: 2.9 }, 모의고사: { 국어: 3, 수학: 3, 영어: 2, 탐구: 3 } },
    createdAt: '2026-07-06T14:00:00.000Z',
  },
]

export const DEMO_ADMIN: UserProfile = {
  uid: 'demo-admin', email: 'admin@demo.kr', name: '에이닷 본사',
  school: '에이닷 본사', role: 'super_admin',
  createdAt: '2026-07-01T00:00:00.000Z',
}

export const DEMO_BRANCH_ADMIN: UserProfile = {
  uid: 'demo-branch', email: 'branch@demo.kr', name: '강남 담당자',
  school: '에이닷 강남지점', role: 'branch_admin',
  createdAt: '2026-07-01T00:00:00.000Z',
}

const PLAN_CONTENTS: Record<string, string[]> = {
  국어: ['현대시 분석', 'EBS 연계 지문', '비문학 독해 연습', '화작문 실전', '문법 총정리', '문학 개념 정리', '수능 기출 풀기'],
  수학: ['수열과 극한', '미적분 기초', '확률과 통계', '공간도형 심화', '벡터 개념', '함수의 극한', '적분 응용'],
  영어: ['독해 기출 풀기', '어휘 암기 300개', '듣기 모의고사', '빈칸 추론 연습', '문법 오답 노트', '순서 배열 연습', '장문 독해'],
  탐구: ['개념 정리 1단원', '기출문제 풀기', '오답노트 정리', '심화 개념 학습', '모의고사 풀기', '2단원 개념', '연도별 기출'],
  기타: ['자기소개서 작성', '독서 활동', '면담 준비', '수능 시간표', '복습 정리'],
}

const SUBS = ['국어', '수학', '영어', '탐구', '기타'] as const

const RAW: Record<string, number[][][]> = {
  'demo-s1': [
    [[150,120,100,100,120,150,150],[120,100,100,100,150,150,150],[150,100,150,200,100,150,150],[100,100,100,100,100,120,150],[10,0,0,0,10,0,0]],
    [[150,120,200,200,220,150,150],[180,200,220,200,120,100,100],[100,150,180,200,220,100,100],[100,100,100,100,100,120,120],[0,30,0,0,30,30,30]],
    [[150,100,200,200,220,150,150],[180,200,220,120,130,150,120],[150,200,200,200,220,180,200],[100,100,200,200,120,120,100],[0,0,5,0,0,0,5]],
    [[120,120,12,150,160,220,180],[150,200,120,120,200,150,200],[120,120,100,100,100,120,180],[100,100,120,150,200,150,180],[0,30,0,40,0,30,30]],
  ],
  'demo-s2': [
    [[130,110,90,100,110,140,130],[110,90,90,80,130,130,130],[140,90,130,180,90,140,140],[90,90,90,90,90,110,130],[0,0,0,0,0,0,0]],
    [[140,110,180,180,200,140,140],[160,180,200,180,110,90,90],[90,130,160,180,200,90,90],[90,90,90,90,90,110,110],[0,20,0,0,20,20,20]],
    [[140,90,180,180,200,140,140],[160,180,200,110,120,140,110],[130,180,180,180,200,160,180],[90,90,180,180,110,110,90],[0,0,0,0,0,0,0]],
    [[110,110,0,140,150,200,160],[130,180,110,110,180,130,180],[110,110,90,90,90,110,160],[90,90,110,130,180,130,160],[0,20,0,30,0,20,20]],
  ],
  'demo-s3': [
    [[180,160,140,160,160,200,200],[160,140,140,140,200,200,200],[200,140,200,240,140,200,200],[140,140,140,140,140,170,200],[20,0,0,0,20,0,0]],
    [[180,160,240,240,260,180,180],[220,240,260,240,160,140,140],[140,180,220,240,260,140,140],[140,140,140,140,140,170,170],[0,40,0,0,40,40,40]],
    [[180,140,240,240,260,180,180],[220,240,260,160,170,180,160],[200,240,240,240,260,220,240],[140,140,240,240,160,170,140],[0,0,10,0,0,0,10]],
    [[160,160,30,190,200,260,220],[200,240,160,160,240,180,240],[160,160,140,140,140,160,220],[140,140,160,190,240,200,220],[0,40,0,60,0,40,40]],
  ],
  'demo-s4': [
    [[100,90,80,80,90,110,110],[90,80,80,70,110,110,110],[110,80,110,150,80,110,110],[80,80,80,80,80,90,110],[0,0,0,0,0,0,0]],
    [[110,90,150,150,170,110,110],[130,150,170,150,90,70,70],[70,110,130,150,170,70,70],[70,70,70,70,70,90,90],[0,0,0,0,0,0,0]],
    [[110,70,150,150,170,110,110],[130,150,170,90,100,110,90],[100,150,150,150,170,130,150],[70,70,150,150,90,90,70],[0,0,0,0,0,0,0]],
    [[80,80,0,110,120,170,140],[110,150,90,90,150,110,150],[90,90,70,70,70,90,140],[70,70,90,110,150,110,140],[0,0,0,0,0,0,0]],
  ],
  'demo-s5': [
    [[120,100,90,90,100,130,120],[100,90,90,80,120,120,120],[120,90,120,160,90,120,120],[90,90,90,90,90,100,120],[10,0,0,0,10,0,0]],
    [[120,100,160,160,180,120,120],[140,160,180,160,100,80,80],[80,120,140,160,180,80,80],[80,80,80,80,80,100,100],[0,20,0,0,20,20,20]],
    [[120,80,160,160,180,120,120],[140,160,180,100,110,120,100],[110,160,160,160,180,140,160],[80,80,160,160,100,100,80],[0,0,0,0,0,0,0]],
    [[90,90,10,120,130,180,150],[110,160,100,100,160,120,160],[100,100,80,80,80,100,150],[80,80,100,120,160,120,150],[0,20,0,30,0,20,20]],
  ],
  'demo-s6': [],
  'demo-s7': [],
  'demo-s8': [],
}

RAW['demo-s6'] = [
  [[130,110,90,90,100,140,130],[110,90,90,80,120,120,120],[120,90,120,160,90,120,120],[90,90,90,90,90,100,120],[0,0,0,0,0,0,0]],
]
RAW['demo-s7'] = [
  [[110,90,80,80,90,120,110],[90,80,80,70,100,100,100],[100,80,100,140,80,100,100],[70,70,70,70,70,80,100],[0,0,0,0,0,0,0]],
  [[110,90,140,140,160,110,110],[120,140,160,140,90,70,70],[70,100,120,140,160,70,70],[70,70,70,70,70,80,80],[0,0,0,0,0,0,0]],
]
RAW['demo-s8'] = [
  [[150,130,120,120,130,160,150],[130,120,120,110,150,150,150],[140,120,150,190,120,150,150],[110,110,110,110,110,130,150],[10,0,0,0,10,0,0]],
  [[150,130,180,180,200,150,150],[170,180,200,180,130,110,110],[110,150,170,180,200,110,110],[110,110,110,110,110,130,130],[0,20,0,0,20,20,20]],
  [[150,110,180,180,200,150,150],[170,180,200,130,140,150,130],[140,180,180,180,200,160,180],[110,110,180,180,130,130,110],[0,0,0,0,0,0,0]],
]

export function buildDemoLogs(): StudyLog[] {
  const logs: StudyLog[] = []

  for (const student of DEMO_STUDENTS) {
    const weeks = RAW[student.uid] ?? []
    weeks.forEach((weekData, wi) => {
      for (let di = 0; di < 7; di++) {
        const subjects: Partial<Record<Subject, number>> = {}
        const plan: Partial<Record<Subject, StudyPlan>> = {}

        SUBS.forEach((sub, idx) => {
          const actual = weekData[idx]?.[di] ?? 0
          if (actual > 0) {
            subjects[sub] = actual
            const ci = (wi * 7 + di + idx) % PLAN_CONTENTS[sub].length
            const ci2 = (ci + 2) % PLAN_CONTENTS[sub].length
            const extra = [0, 10, 20][((wi + di) % 3)]
            const contents = actual >= 120
              ? [PLAN_CONTENTS[sub][ci], PLAN_CONTENTS[sub][ci2]]
              : [PLAN_CONTENTS[sub][ci]]
            plan[sub] = { contents, plannedMinutes: actual + extra }
          }
        })

        const total = Object.values(subjects).reduce((s, v) => s + (v ?? 0), 0)
        if (total === 0) continue

        const plannedTotal = Object.values(plan).reduce((s, p) => s + (p?.plannedMinutes ?? 0), 0)
        const date = dateOf(wi + 1, di)

        logs.push({
          id: `${student.uid}_${date}`,
          userId: student.uid,
          userName: student.name,
          userSchool: student.school,
          date,
          week: wi + 1,
          plan,
          plannedTotalMinutes: plannedTotal,
          subjects,
          totalMinutes: total,
          status: 'approved',
          approvedBy: '관리자',
          approvedAt: `${date}T21:00:00.000Z`,
          createdAt: `${date}T09:00:00.000Z`,
        })
      }
    })
  }
  return logs
}

export const DEMO_LOGS = buildDemoLogs()

export function buildDemoPendingPlans(): StudyLog[] {
  const today = toDateStr(new Date())
  const week = getWeekFromDate(today) || 1
  return [
    {
      id: `demo-s1_${today}`,
      userId: 'demo-s1', userName: '김에이', userSchool: '에이닷 강남지점',
      date: today, week,
      plan: {
        수학: { contents: ['수열과 극한 예제풀기', '극한값 계산 연습'], plannedMinutes: 120 },
        영어: { contents: ['독해 기출문제 풀기'], plannedMinutes: 90 },
        국어: { contents: ['EBS 연계 지문 분석', '현대시 해석'], plannedMinutes: 60 },
      },
      plannedTotalMinutes: 270, subjects: {}, totalMinutes: 0,
      status: 'planned', createdAt: `${today}T09:00:00.000Z`,
    },
    {
      id: `demo-s2_${today}`,
      userId: 'demo-s2', userName: '박서준', userSchool: '에이닷 강남지점',
      date: today, week,
      plan: {
        수학: { contents: ['미적분 기초 개념 복습', '도함수 문제풀이'], plannedMinutes: 150 },
        탐구: { contents: ['개념 정리 2단원'], plannedMinutes: 90 },
      },
      scheduleSlots: {
        '09:00': '수학', '09:30': '수학', '10:00': '수학', '10:30': '수학', '11:00': '수학',
        '11:30': '탐구', '12:00': '탐구', '12:30': '탐구',
      },
      deductions: [
        { slot: '09:30', minutes: 5, reason: '졸음', by: '김에이T', at: `${today}T14:02:00.000Z` },
      ],
      plannedTotalMinutes: 240, subjects: {}, totalMinutes: 0,
      status: 'planned', createdAt: `${today}T09:10:00.000Z`,
    },
    {
      id: `demo-s5_${today}`,
      userId: 'demo-s5', userName: '정수아', userSchool: '에이닷 마포지점',
      date: today, week,
      plan: {
        국어: { contents: ['화작문 실전 문제풀이'], plannedMinutes: 90 },
        영어: { contents: ['어휘 암기 300개', '문법 오답노트'], plannedMinutes: 60 },
        기타: { contents: ['자기소개서 작성'], plannedMinutes: 60 },
      },
      plannedTotalMinutes: 210, subjects: {}, totalMinutes: 0,
      status: 'planned', createdAt: `${today}T09:05:00.000Z`,
    },
  ]
}

export const DEMO_PENDING_PLANS = buildDemoPendingPlans()
