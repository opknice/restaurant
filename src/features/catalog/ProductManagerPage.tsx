import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'

interface Category {
  readonly id: string
  readonly name: string
}

interface ProductRow {
  readonly active: boolean
  readonly category_id: string
  readonly id: string
  readonly name: string
  readonly price: number | string
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ'
}

export function ProductManagerPage() {
  const { profile } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [categoryName, setCategoryName] = useState('')
  const [productName, setProductName] = useState('')
  const [price, setPrice] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!supabase) return
    setIsLoading(true)
    const [categoryResult, productResult] = await Promise.all([
      supabase.from('categories').select('id, name').order('sort_order').order('name'),
      supabase.from('products').select('id, category_id, name, price, active').order('name'),
    ])
    if (categoryResult.error) setErrorMessage(categoryResult.error.message)
    else setCategories(categoryResult.data as unknown as Category[])
    if (productResult.error) setErrorMessage(productResult.error.message)
    else setProducts(productResult.data as unknown as ProductRow[])
    setIsLoading(false)
  }, [])

  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh])

  if (profile?.role !== 'manager') {
    return <section className="content-card"><h2>ไม่มีสิทธิ์เข้าถึง</h2><p className="muted">การจัดการสินค้าเปิดให้เฉพาะ manager เท่านั้น</p></section>
  }

  const addCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setErrorMessage(null)
    const { error } = await supabase.from('categories').insert({ name: categoryName.trim() })
    if (error) setErrorMessage(error.message)
    else { setCategoryName(''); await refresh() }
  }

  const addProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setErrorMessage(null)
    const numericPrice = Number(price)
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setErrorMessage('ราคาต้องเป็นตัวเลขตั้งแต่ 0 บาทขึ้นไป')
      return
    }
    const { error } = await supabase.from('products').insert({ category_id: categoryId, name: productName.trim(), price: numericPrice })
    if (error) setErrorMessage(error.message)
    else { setProductName(''); setPrice(''); await refresh() }
  }

  const toggleProduct = async (product: ProductRow) => {
    if (!supabase) return
    setErrorMessage(null)
    const { error } = await supabase.from('products').update({ active: !product.active }).eq('id', product.id)
    if (error) setErrorMessage(errorText(error))
    else await refresh()
  }

  const editPrice = async (product: ProductRow) => {
    if (!supabase) return
    const result = window.prompt(`แก้ไขราคา: ${product.name}`, String(product.price))
    if (result === null) return
    const nextPrice = Number(result)
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      setErrorMessage('ราคาต้องเป็นตัวเลขตั้งแต่ 0 บาทขึ้นไป')
      return
    }
    setErrorMessage(null)
    const { error } = await supabase.from('products').update({ price: nextPrice }).eq('id', product.id)
    if (error) setErrorMessage(errorText(error))
    else await refresh()
  }

  return <section className="manager-page"><header className="sales-heading"><div><p className="eyebrow">MANAGER</p><h2>สินค้าและหมวดหมู่</h2></div><button className="secondary-button" onClick={() => void refresh()} type="button">รีเฟรช</button></header>{errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}<div className="manager-grid"><form className="content-card compact-form" onSubmit={(event) => void addCategory(event)}><h3>เพิ่มหมวดสินค้า</h3><label>ชื่อหมวด<input onChange={(event) => setCategoryName(event.target.value)} required value={categoryName} /></label><button className="primary-button" type="submit">เพิ่มหมวด</button></form><form className="content-card compact-form" onSubmit={(event) => void addProduct(event)}><h3>เพิ่มสินค้า</h3><label>หมวด<select onChange={(event) => setCategoryId(event.target.value)} required value={categoryId}><option value="">เลือกหมวด</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>ชื่อสินค้า<input onChange={(event) => setProductName(event.target.value)} required value={productName} /></label><label>ราคา<input inputMode="decimal" min="0" onChange={(event) => setPrice(event.target.value)} required step="0.01" type="number" value={price} /></label><button className="primary-button" disabled={categories.length === 0} type="submit">เพิ่มสินค้า</button></form></div><section className="content-card"><h3>รายการสินค้า ({products.length})</h3>{isLoading ? <p className="muted">กำลังโหลด...</p> : <div className="product-manager-list">{products.map((product) => <article key={product.id}><div><strong>{product.name}</strong><span>{Number(product.price).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</span></div><div className="inline-actions"><button className="secondary-button" onClick={() => void editPrice(product)} type="button">แก้ราคา</button><button className="secondary-button" onClick={() => void toggleProduct(product)} type="button">{product.active ? 'ปิดการขาย' : 'เปิดขาย'}</button></div></article>)}</div>}</section></section>
}
