// Firebase Admin SDK 초기화 — 서버 전용, 절대 클라이언트 코드에서 import하지 말 것
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY 환경변수가 설정되지 않았어요')
  const serviceAccount = JSON.parse(raw)
  return initializeApp({ credential: cert(serviceAccount) })
}

export function adminAuth() {
  return getAuth(getAdminApp())
}

export function adminDb() {
  return getFirestore(getAdminApp())
}
