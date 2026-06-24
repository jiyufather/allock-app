'use client'
// 학생 회원가입 페이지 (3단계: 기본정보+목표라인 → 목표시간설정 → 계정)

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { createUserProfile, validateStudentCode, markCodeUsed, DEMO_MODE } from '@/lib/firestore'
import { formatMinutes } from '@/lib/config'
import { UNIVERSITY_LINES, GRADE_LEVEL_LABELS, type UniversityLine, type GradeLevel } from '@/types'
import { STUDY_GUIDE_MINUTES } from '@/lib/studyGuide'
import { BRANCHES } from '@/lib/branches'
import { toLoginEmail } from '@/lib/auth'

const GRADE_LABELS = ['국어', '수학', '영어', '탐구'] as const
const GRADE_LEVELS: { key: GradeLevel; label: string }[] = [
  { key: 'elementary', label: '초등' },
  { key: 'middle', label: '중등' },
  { key: 'high', label: '고등' },
]

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [codeChecking, setCodeChecking] = useState(false)

  const [form, setForm] = useState({
    studentCode: '',
    name: '',
    school: '',
    gradeLevel: '' as GradeLevel | '',
    targetLine: '' as UniversityLine | '',
    targetUniversity: '',
    email: '',
    password: '',
    passwordConfirm: '',
    dailyMinutes: 300,
    weeklyMinutes: 1500,
    grades: {
      내신: { 국어: '', 수학: '', 영어: '', 탐구: '' },
      모의고사: { 국어: '', 수학: '', 영어: '', 탐구: '' },
    },
  })

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function updateGrade(type: '내신' | '모의고사', subject: string, value: string) {
    setForm(prev => ({
      ...prev,
      grades: { ...prev.grades, [type]: { ...prev.grades[type], [subject]: value } },
    }))
  }

  async function goToStep2() {
    setError('')
    setCodeChecking(true)
    try {
      const result = await validateStudentCode(form.studentCode.trim().toUpperCase())
      if (!result) {
        setError('유효하지 않은 학생코드예요. 관리자에게 확인해주세요.')
        return
      }
      if (!DEMO_MODE && result.branchName !== form.school) {
        setError('선택한 지점과 학생코드의 지점이 일치하지 않아요. 다시 확인해주세요.')
        return
      }
      const guide = form.targetLine && form.gradeLevel
        ? STUDY_GUIDE_MINUTES[form.targetLine as UniversityLine]?.[form.gradeLevel as GradeLevel]
        : null
      if (guide) {
        setForm(prev => ({
          ...prev,
          dailyMinutes: guide,
          weeklyMinutes: Math.round(guide * 5 / 30) * 30,
        }))
      }
      setStep(2)
    } finally {
      setCodeChecking(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.email.trim().length < 4) { setError('아이디는 4자 이상이어야 해요.'); return }
    if (form.password !== form.passwordConfirm) { setError('비밀번호가 일치하지 않아요.'); return }
    if (form.password.length < 6) { setError('비밀번호는 6자 이상이어야 해요.'); return }
    setSubmitting(true)
    try {
      const loginEmail = toLoginEmail(form.email)
      const cred = await createUserWithEmailAndPassword(auth, loginEmail, form.password)
      const studentCode = form.studentCode.trim().toUpperCase()
      await markCodeUsed(studentCode, cred.user.uid)
      const cleanGrades = (g: { 국어: string; 수학: string; 영어: string; 탐구: string }) => {
        const out: Record<string, number> = {}
        for (const [k, v] of Object.entries(g)) {
          const n = parseFloat(v)
          if (!isNaN(n)) out[k] = n
        }
        return out
      }
      await createUserProfile(cred.user.uid, {
        email: loginEmail,
        name: form.name,
        school: form.school,
        role: 'student',
        studentCode,
        ...(form.gradeLevel && { gradeLevel: form.gradeLevel }),
        ...(form.targetLine && { targetLine: form.targetLine }),
        ...(form.targetUniversity.trim() && { targetUniversity: form.targetUniversity.trim() }),
        goal: { dailyMinutes: form.dailyMinutes, weeklyMinutes: form.weeklyMinutes },
        grades: {
          내신: cleanGrades(form.grades.내신),
          모의고사: cleanGrades(form.grades.모의고사),
        },
      })
      router.replace('/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('email-already-in-use')) setError('이미 사용 중인 아이디예요.')
      else setError('회원가입에 실패했어요. 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  const guideMinutes = form.targetLine && form.gradeLevel
    ? STUDY_GUIDE_MINUTES[form.targetLine as UniversityLine]?.[form.gradeLevel as GradeLevel]
    : null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="text-5xl">🌸</div>
          <h1 className="text-2xl font-black text-purple-dark">올락 가입하기</h1>
          <div className="flex items-center justify-center gap-2 pt-2">
            {[1, 2, 3].map(s => (
              <div key={s} className={`h-2 rounded-full transition-all ${
                s === step ? 'w-8 bg-purple-soft' : s < step ? 'w-2 bg-purple-soft/50' : 'w-2 bg-purple-light'
              }`} />
            ))}
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-xl shadow-purple-100/50 border border-purple-50">

          {/* ── 단계 1: 기본 정보 + 목표 라인 ── */}
          {step === 1 && (
            <form onSubmit={e => { e.preventDefault(); goToStep2() }} className="space-y-4" noValidate>
              <p className="text-sm font-bold text-purple-dark">기본 정보</p>

              {/* 학생코드 */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">학생코드 *</label>
                <input
                  type="text"
                  value={form.studentCode}
                  onChange={e => update('studentCode', e.target.value.toUpperCase())}
                  placeholder="예: 202512345678"
                  required
                  className="w-full px-4 py-3 rounded-2xl border-2 border-purple-light bg-purple-light/30 focus:border-purple-soft focus:outline-none focus:bg-white transition-all text-sm font-mono placeholder:text-gray-300"
                />
                <p className="text-xs text-gray-400">학원에서 받은 학생코드를 입력해주세요.</p>
              </div>

              {/* 지점 선택 */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">지점 *</label>
                <select
                  value={form.school}
                  onChange={e => update('school', e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-2xl border-2 border-purple-light bg-purple-light/30 focus:border-purple-soft focus:outline-none focus:bg-white transition-all text-sm text-gray-700"
                >
                  <option value="">지점을 선택해주세요</option>
                  {BRANCHES.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400">학생코드와 지점이 일치해야 가입할 수 있어요.</p>
              </div>

              {/* 이름 */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">이름</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => update('name', e.target.value)}
                  placeholder="실명을 입력해주세요"
                  required
                  className="w-full px-4 py-3 rounded-2xl border-2 border-purple-light bg-purple-light/30 focus:border-purple-soft focus:outline-none focus:bg-white transition-all text-sm placeholder:text-gray-300"
                />
              </div>

              {/* 학교급 */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">학교급 *</label>
                <div className="grid grid-cols-3 gap-2">
                  {GRADE_LEVELS.map(g => (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => update('gradeLevel', g.key)}
                      className="py-2.5 rounded-2xl text-sm font-bold transition-all"
                      style={form.gradeLevel === g.key
                        ? { background: 'linear-gradient(135deg, #C9B8FF, #FFB3C6)', color: '#fff' }
                        : { backgroundColor: '#f3f4f6', color: '#6b7280' }}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 목표 대학 라인 */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500">목표 대학 라인 *</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {UNIVERSITY_LINES.map(line => (
                    <button
                      key={line}
                      type="button"
                      onClick={() => update('targetLine', line)}
                      className="py-2 px-2 rounded-xl text-xs font-bold transition-all text-left"
                      style={form.targetLine === line
                        ? { background: 'linear-gradient(135deg, #C9B8FF88, #FFB3C688)', color: '#5b4fa8', border: '2px solid #C9B8FF' }
                        : { backgroundColor: '#f9f9f9', color: '#6b7280', border: '2px solid transparent' }}
                    >
                      {line}
                      {form.gradeLevel && form.targetLine === line && guideMinutes && (
                        <span className="block text-purple-soft mt-0.5">
                          권장 {formatMinutes(guideMinutes)}/일
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {guideMinutes && (
                  <p className="text-xs text-purple-dark text-center font-medium bg-purple-light/30 rounded-xl py-1.5">
                    {GRADE_LEVEL_LABELS[form.gradeLevel as GradeLevel]} {form.targetLine} 권장 학습: {formatMinutes(guideMinutes)}/일
                  </p>
                )}
              </div>

              {/* 세부 대학명 */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">목표 대학교 (세부)</label>
                <input
                  type="text"
                  value={form.targetUniversity}
                  onChange={e => update('targetUniversity', e.target.value)}
                  placeholder="예: 연세대학교 경영학과"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-purple-light bg-purple-light/30 focus:border-purple-soft focus:outline-none focus:bg-white transition-all text-sm placeholder:text-gray-300"
                />
              </div>

              {/* 성적 */}
              <div className="space-y-3 pt-1">
                <p className="text-xs font-semibold text-gray-500">현재 성적 (선택)</p>
                {(['내신', '모의고사'] as const).map(type => (
                  <div key={type} className="space-y-1">
                    <p className="text-xs text-gray-400">{type}</p>
                    <div className="grid grid-cols-4 gap-2">
                      {GRADE_LABELS.map(sub => (
                        <div key={sub} className="space-y-1">
                          <p className="text-xs text-center text-gray-400">{sub}</p>
                          <input
                            type="number" step="0.1" min="1" max="9"
                            value={form.grades[type][sub]}
                            onChange={e => updateGrade(type, sub, e.target.value)}
                            placeholder="-"
                            className="w-full px-2 py-2 rounded-xl border-2 border-purple-light bg-purple-light/30 focus:border-purple-soft focus:outline-none text-sm text-center placeholder:text-gray-300"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {error && <div className="bg-pink-light text-pink-dark text-sm rounded-2xl px-4 py-3 font-medium">{error}</div>}
              <button
                type="submit"
                disabled={!form.gradeLevel || !form.targetLine || !form.studentCode.trim() || !form.school || codeChecking}
                className="w-full py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-soft to-pink-soft hover:from-purple-dark hover:to-pink-dark transition-all shadow-lg shadow-purple-200/50 disabled:opacity-50"
              >
                {codeChecking ? '코드 확인 중...' : '다음'}
              </button>
            </form>
          )}

          {/* ── 단계 2: 목표 시간 설정 ── */}
          {step === 2 && (
            <form onSubmit={e => { e.preventDefault(); setStep(3) }} className="space-y-5">
              <div>
                <p className="text-sm font-bold text-purple-dark">공부 목표 설정</p>
                {guideMinutes && (
                  <p className="text-xs text-purple-dark/70 mt-1">
                    {GRADE_LEVEL_LABELS[form.gradeLevel as GradeLevel]} {form.targetLine} 권장: {formatMinutes(guideMinutes)}/일로 설정됐어요
                  </p>
                )}
              </div>

              {/* 일일 목표 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-500">하루 목표 순공시간</label>
                  <span className="text-sm font-black text-purple-dark">{formatMinutes(form.dailyMinutes)}</span>
                </div>
                <input
                  type="range" min="60" max="1200" step="30"
                  value={form.dailyMinutes}
                  onChange={e => update('dailyMinutes', Number(e.target.value))}
                  className="w-full accent-purple-400"
                />
                <div className="grid grid-cols-4 gap-2">
                  {[180, 240, 300, 360].map(p => (
                    <button key={p} type="button" onClick={() => update('dailyMinutes', p)}
                      className="py-2 rounded-xl text-xs font-bold transition-all"
                      style={form.dailyMinutes === p
                        ? { background: 'linear-gradient(135deg, #C9B8FF, #FFB3C6)', color: '#fff' }
                        : { backgroundColor: '#f3f4f6', color: '#6b7280' }}>
                      {p / 60}시간
                    </button>
                  ))}
                </div>
              </div>

              {/* 주간 목표 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-500">주간 목표 순공시간</label>
                  <span className="text-sm font-black text-purple-dark">{formatMinutes(form.weeklyMinutes)}</span>
                </div>
                <input
                  type="range" min="300" max="6000" step="60"
                  value={form.weeklyMinutes}
                  onChange={e => update('weeklyMinutes', Number(e.target.value))}
                  className="w-full accent-purple-400"
                />
                <div className="grid grid-cols-4 gap-2">
                  {[900, 1200, 1500, 1800].map(p => (
                    <button key={p} type="button" onClick={() => update('weeklyMinutes', p)}
                      className="py-2 rounded-xl text-xs font-bold transition-all"
                      style={form.weeklyMinutes === p
                        ? { background: 'linear-gradient(135deg, #B8F0E6, #C9B8FF)', color: '#fff' }
                        : { backgroundColor: '#f3f4f6', color: '#6b7280' }}>
                      {p / 60}h
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-r from-purple-light to-pink-light rounded-2xl p-3 text-center">
                <p className="text-xs text-gray-500">4주 목표 달성 시</p>
                <p className="font-black text-purple-dark">{formatMinutes(form.weeklyMinutes * 4)} 순공</p>
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(1)} className="flex-1 py-3.5 rounded-2xl font-bold text-purple-dark bg-purple-light hover:bg-purple-soft/30 transition-all">이전</button>
                <button type="submit" className="flex-1 py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-soft to-pink-soft hover:from-purple-dark hover:to-pink-dark transition-all shadow-lg shadow-purple-200/50">다음</button>
              </div>
            </form>
          )}

          {/* ── 단계 3: 계정 설정 ── */}
          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm font-bold text-purple-dark">계정 설정</p>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">아이디</label>
                <input
                  type="text"
                  value={form.email}
                  onChange={e => update('email', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                  placeholder="영문 소문자/숫자 4~20자"
                  minLength={4}
                  maxLength={20}
                  required
                  className="w-full px-4 py-3 rounded-2xl border-2 border-purple-light bg-purple-light/30 focus:border-purple-soft focus:outline-none focus:bg-white transition-all text-sm placeholder:text-gray-300"
                />
              </div>
              {[
                { label: '비밀번호', key: 'password' as const, type: 'password', placeholder: '6자 이상' },
                { label: '비밀번호 확인', key: 'passwordConfirm' as const, type: 'password', placeholder: '동일하게 입력' },
              ].map(f => (
                <div key={f.key} className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500">{f.label}</label>
                  <input
                    type={f.type}
                    value={form[f.key]}
                    onChange={e => update(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    required
                    className="w-full px-4 py-3 rounded-2xl border-2 border-purple-light bg-purple-light/30 focus:border-purple-soft focus:outline-none focus:bg-white transition-all text-sm placeholder:text-gray-300"
                  />
                </div>
              ))}
              {error && <div className="bg-pink-light text-pink-dark text-sm rounded-2xl px-4 py-3 font-medium">{error}</div>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(2)} className="flex-1 py-3.5 rounded-2xl font-bold text-purple-dark bg-purple-light hover:bg-purple-soft/30 transition-all">이전</button>
                <button type="submit" disabled={submitting} className="flex-1 py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-soft to-pink-soft hover:from-purple-dark hover:to-pink-dark transition-all shadow-lg shadow-purple-200/50 disabled:opacity-60">
                  {submitting ? '가입 중...' : '가입하기'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-gray-400">
          이미 계정이 있다면?{' '}
          <Link href="/login" className="text-purple-dark font-bold hover:underline">로그인</Link>
        </p>
      </div>
    </div>
  )
}
