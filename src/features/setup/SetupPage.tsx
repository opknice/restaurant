export function SetupPage() {
  return (
    <main className="setup-page">
      <section className="setup-card" aria-labelledby="setup-title">
        <p className="eyebrow">Phase 1 · ระบบยังไม่เชื่อมฐานข้อมูล</p>
        <h1 id="setup-title">ตั้งค่า Supabase ก่อนเริ่มใช้งาน</h1>
        <p>คัดลอก <code>.env.example</code> เป็น <code>.env.local</code> แล้วใส่ Project URL และ Publishable key ของ Supabase จากนั้นรัน migration ในโฟลเดอร์ <code>supabase/migrations</code></p>
        <p className="muted">ห้ามใส่ service role key ใน Vercel หรือไฟล์ environment ของ browser</p>
      </section>
    </main>
  )
}
