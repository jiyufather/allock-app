// 학생 로그인 아이디 ↔ Firebase Auth용 합성 이메일 변환 (학생에게 이메일 형식을 노출하지 않기 위함)
const LOGIN_DOMAIN = 'ollak.app'

export function toLoginEmail(id: string): string {
  return `${id.trim().toLowerCase()}@${LOGIN_DOMAIN}`
}

export function fromLoginEmail(email: string): string {
  return email.split('@')[0]
}
