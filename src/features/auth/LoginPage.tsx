import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './useAuth'

export function LoginPage() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (session) {
    return <Navigate replace to="/" />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    const error = await signIn(email.trim(), password)
    setErrorMessage(error)
    setIsSubmitting(false)
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">POS ร้านอาหาร</p>
        <h1 id="login-title">เข้าสู่ระบบ</h1>
        <p className="muted">ใช้บัญชีที่ผู้จัดการสร้างให้เพื่อเริ่มใช้งาน</p>
        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            อีเมล
            <input autoComplete="email" inputMode="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label>
            รหัสผ่าน
            <input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </section>
    </main>
  )
}
