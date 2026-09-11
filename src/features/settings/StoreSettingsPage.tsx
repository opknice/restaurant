import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'

interface StoreSettings {
  readonly bank_account_name: string | null
  readonly bank_account_number: string | null
  readonly bank_payment_label: string | null
  readonly bank_reference: string | null
  readonly payment_qr_path: string | null
  readonly phone: string | null
  readonly receipt_footer: string | null
  readonly social_contact: string | null
  readonly store_name: string
}

const emptySettings: StoreSettings = {
  bank_account_name: '', bank_account_number: '', bank_payment_label: '', bank_reference: '', payment_qr_path: '', phone: '', receipt_footer: '', social_contact: '', store_name: '',
}

export function StoreSettingsPage() {
  const { profile } = useAuth()
  const [settings, setSettings] = useState<StoreSettings>(emptySettings)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    if (!supabase) return
    setIsLoading(true)
    const { data, error } = await supabase
      .from('store_settings')
      .select('store_name, social_contact, phone, receipt_footer, payment_qr_path, bank_payment_label, bank_account_name, bank_account_number, bank_reference')
      .eq('singleton', true)
      .single()
    if (error) setErrorMessage(error.message)
    else setSettings(data as unknown as StoreSettings)
    setIsLoading(false)
  }, [])

  useEffect(() => { void Promise.resolve().then(loadSettings) }, [loadSettings])

  if (profile?.role !== 'manager') {
    return <section className="content-card"><h2>ไม่มีสิทธิ์เข้าถึง</h2><p className="muted">การตั้งค่าร้านเปิดให้เฉพาะ manager เท่านั้น</p></section>
  }

  const updateField = <Key extends keyof StoreSettings>(key: Key, value: StoreSettings[Key]) => setSettings((current) => ({ ...current, [key]: value }))
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setIsSaving(true)
    setErrorMessage(null)
    const { error } = await supabase.from('store_settings').update(settings).eq('singleton', true)
    if (error) setErrorMessage(error.message)
    setIsSaving(false)
  }

  return <section className="manager-page"><header><p className="eyebrow">MANAGER</p><h2>ตั้งค่าร้านและข้อมูลรับโอน</h2></header>{errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}{isLoading ? <section className="content-card"><p className="muted">กำลังโหลด...</p></section> : <form className="content-card settings-form" onSubmit={(event) => void save(event)}><h3>ข้อมูลหัวบิล</h3><label>ชื่อร้าน<input onChange={(event) => updateField('store_name', event.target.value)} required value={settings.store_name} /></label><label>เบอร์โทรศัพท์<input onChange={(event) => updateField('phone', event.target.value)} value={settings.phone ?? ''} /></label><label>ช่องทางติดต่อ<input onChange={(event) => updateField('social_contact', event.target.value)} value={settings.social_contact ?? ''} /></label><label>ข้อความท้ายบิล<textarea onChange={(event) => updateField('receipt_footer', event.target.value)} value={settings.receipt_footer ?? ''} /></label><h3>ข้อมูลเงินโอน</h3><label>ชื่อธนาคาร/ช่องทาง<input onChange={(event) => updateField('bank_payment_label', event.target.value)} value={settings.bank_payment_label ?? ''} /></label><label>ชื่อบัญชี<input onChange={(event) => updateField('bank_account_name', event.target.value)} value={settings.bank_account_name ?? ''} /></label><label>เลขบัญชี<input onChange={(event) => updateField('bank_account_number', event.target.value)} value={settings.bank_account_number ?? ''} /></label><label>คำแนะนำอ้างอิงการโอน<input onChange={(event) => updateField('bank_reference', event.target.value)} value={settings.bank_reference ?? ''} /></label><label>URL รูป QR สำหรับชำระเงิน<input inputMode="url" onChange={(event) => updateField('payment_qr_path', event.target.value)} placeholder="https://..." value={settings.payment_qr_path ?? ''} /></label><p className="muted">เก็บ URL รูป QR ที่เข้าถึงได้ผ่าน HTTPS; ส่วนแสดง QR ในหน้าชำระเงินจะเพิ่มพร้อมงานปรับใบพิมพ์จริง</p><div><button className="primary-button" disabled={isSaving} type="submit">{isSaving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}</button></div></form>}</section>
}
