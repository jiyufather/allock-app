// Firebase 초기화 — API key가 있을 때만 실제 초기화 (데모 모드 안전)
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? ''
const hasConfig = apiKey.length > 0

const firebaseConfig = {
  apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
}

// API key 없으면 Firebase 자체를 초기화하지 않음 (데모 모드)
const _app: FirebaseApp | null = hasConfig
  ? getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApps()[0]
  : null

export const auth: Auth =
  hasConfig && _app ? getAuth(_app) : (null as unknown as Auth)

export const db: Firestore =
  hasConfig && _app ? getFirestore(_app) : (null as unknown as Firestore)
