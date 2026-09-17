import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'
import { invalidateProductsCache } from '../sales/salesApi'

type CatalogTab = 'products' | 'categories' | 'subcategories'
type ProductModalMode = 'create' | 'edit'

interface Category {
  readonly active: boolean
  readonly id: string
  readonly name: string
}

interface Subcategory {
  readonly active: boolean
  readonly category_id: string
  readonly id: string
  readonly name: string
  readonly sort_order: number
}

interface ProductRow {
  readonly active: boolean
  readonly category_id: string
  readonly group_name: string | null
  readonly id: string
  readonly is_favorite: boolean
  readonly name: string
  readonly price: number | string
  readonly subcategoryIds: readonly string[]
  readonly subcategoryNames: readonly string[]
}

interface ProductSubcategoryLinkRow {
  readonly product_id: string
  readonly subcategory_id: string
  readonly subcategories: { readonly name: string } | null
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ'
}

function formatPrice(value: number | string): string {
  return Number(value).toLocaleString('th-TH', { minimumFractionDigits: 2 })
}

export function ProductManagerPage() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState<CatalogTab>('products')
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])

  const [categoryName, setCategoryName] = useState('')
  const [subcategoryName, setSubcategoryName] = useState('')
  const [subcategoryCategoryId, setSubcategoryCategoryId] = useState('')
  const [subcategoryListCategoryId, setSubcategoryListCategoryId] = useState('ทั้งหมด')

  const [productName, setProductName] = useState('')
  const [productGroupName, setProductGroupName] = useState('')
  const [price, setPrice] = useState('')
  const [productCategoryId, setProductCategoryId] = useState('')
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = useState<string[]>([])
  const [productModalMode, setProductModalMode] = useState<ProductModalMode | null>(null)
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null)
  const [deletingProduct, setDeletingProduct] = useState<ProductRow | null>(null)

  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editingSubcategory, setEditingSubcategory] = useState<Subcategory | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingSubcategoryCategoryId, setEditingSubcategoryCategoryId] = useState('')

  const [productSearch, setProductSearch] = useState('')
  const [productCategoryFilter, setProductCategoryFilter] = useState('ทั้งหมด')
  const [productStatusFilter, setProductStatusFilter] = useState<'ทั้งหมด' | 'เปิดขาย' | 'ปิดขาย'>('ทั้งหมด')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [submittingAction, setSubmittingAction] = useState<string | null>(null)

  const isSubmitting = submittingAction !== null
  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])
  const activeCategories = useMemo(() => categories.filter((category) => category.active), [categories])
  const productCategoryOptions = useMemo(() => {
    const currentCategory = categories.find((category) => category.id === productCategoryId)
    return currentCategory && !currentCategory.active ? [currentCategory, ...activeCategories] : activeCategories
  }, [activeCategories, categories, productCategoryId])
  const productCountByCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const product of products) counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1)
    return counts
  }, [products])
  const productGroupOptions = useMemo(() => Array.from(new Set(products
    .map((product) => product.group_name?.trim())
    .filter((groupName): groupName is string => Boolean(groupName))))
    .sort((left, right) => left.localeCompare(right, 'th')), [products])
  const activeProductSubcategories = useMemo(
    () => subcategories.filter((subcategory) => subcategory.category_id === productCategoryId && subcategory.active),
    [productCategoryId, subcategories],
  )
  const filteredSubcategories = useMemo(
    () => subcategories.filter((subcategory) => subcategoryListCategoryId === 'ทั้งหมด' || subcategory.category_id === subcategoryListCategoryId),
    [subcategories, subcategoryListCategoryId],
  )
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase()
    return products.filter((product) => {
      const matchesCategory = productCategoryFilter === 'ทั้งหมด' || product.category_id === productCategoryFilter
      const matchesStatus = productStatusFilter === 'ทั้งหมด'
        || (productStatusFilter === 'เปิดขาย' && product.active)
        || (productStatusFilter === 'ปิดขาย' && !product.active)
      const matchesSearch = !query
        || product.name.toLowerCase().includes(query)
        || product.group_name?.toLowerCase().includes(query)
        || product.subcategoryNames.some((name) => name.toLowerCase().includes(query))
      return matchesCategory && matchesStatus && matchesSearch
    })
  }, [productCategoryFilter, productSearch, productStatusFilter, products])

  const refresh = useCallback(async () => {
    if (!supabase || profile?.role !== 'manager') return
    setIsLoading(true)
    try {
      const [categoryResult, productResult] = await Promise.all([
        supabase.from('categories').select('id, name, active').order('sort_order').order('name'),
        supabase.from('products').select('id, category_id, group_name, is_favorite, name, price, active').order('name'),
      ])
      if (categoryResult.error) throw categoryResult.error
      if (productResult.error) throw productResult.error
      const subcategoryResult = await supabase
        .from('subcategories')
        .select('id, category_id, name, sort_order, active')
        .order('sort_order')
        .order('name')
      if (subcategoryResult.error) throw subcategoryResult.error
      const linkResult = await supabase
        .from('product_subcategories')
        .select('product_id, subcategory_id, subcategories(name)')
      if (linkResult.error) throw linkResult.error

      const links = linkResult.data as unknown as readonly ProductSubcategoryLinkRow[]
      const linksByProduct = new Map<string, ProductSubcategoryLinkRow[]>()
      for (const link of links) {
        const productLinks = linksByProduct.get(link.product_id) ?? []
        productLinks.push(link)
        linksByProduct.set(link.product_id, productLinks)
      }

      setCategories(categoryResult.data as unknown as Category[])
      setSubcategories(subcategoryResult.data as unknown as Subcategory[])
      setProducts((productResult.data as unknown as readonly Omit<ProductRow, 'subcategoryIds' | 'subcategoryNames'>[]).map((product) => {
        const productLinks = linksByProduct.get(product.id) ?? []
        return {
          ...product,
          subcategoryIds: productLinks.map((link) => link.subcategory_id),
          subcategoryNames: productLinks.flatMap((link) => link.subcategories ? [link.subcategories.name] : []),
        }
      }))
    } catch (error: unknown) {
      setErrorMessage(errorText(error))
    } finally {
      setIsLoading(false)
    }
  }, [profile?.role])

  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh])

  if (profile?.role !== 'manager') {
    return <section className="content-card"><h2>ไม่มีสิทธิ์เข้าถึง</h2><p className="muted">การจัดการสินค้าเปิดให้เฉพาะ manager เท่านั้น</p></section>
  }

  const startAction = (action: string) => {
    setErrorMessage(null)
    setSuccessMessage(null)
    setSubmittingAction(action)
  }

  const finishAction = (message: string) => {
    setSuccessMessage(message)
    setSubmittingAction(null)
  }

  const failAction = (error: unknown) => {
    setErrorMessage(errorText(error))
    setSubmittingAction(null)
  }

  const addCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    const name = categoryName.trim()
    if (!name) {
      setErrorMessage('กรุณาระบุชื่อหมวดสินค้า')
      return
    }
    startAction('create-category')
    try {
      const { error } = await supabase.from('categories').insert({ name })
      if (error) throw error
      setCategoryName('')
      await refresh()
      finishAction(`เพิ่มหมวด “${name}” แล้ว`)
    } catch (error: unknown) { failAction(error) }
  }

  const addSubcategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !subcategoryCategoryId) return
    const name = subcategoryName.trim()
    if (!name) {
      setErrorMessage('กรุณาระบุชื่อหัวข้อย่อย')
      return
    }
    startAction('create-subcategory')
    try {
      const { error } = await supabase.from('subcategories').insert({ category_id: subcategoryCategoryId, name })
      if (error) throw error
      setSubcategoryName('')
      setSubcategoryListCategoryId(subcategoryCategoryId)
      await refresh()
      finishAction(`เพิ่มหัวข้อย่อย “${name}” แล้ว`)
    } catch (error: unknown) { failAction(error) }
  }

  const resetProductForm = () => {
    setProductName('')
    setProductGroupName('')
    setPrice('')
    setProductCategoryId('')
    setSelectedSubcategoryIds([])
    setEditingProduct(null)
    setProductModalMode(null)
  }

  const openCreateProduct = () => {
    setProductName('')
    setProductGroupName('')
    setPrice('')
    setProductCategoryId(activeCategories[0]?.id ?? '')
    setSelectedSubcategoryIds([])
    setEditingProduct(null)
    setProductModalMode('create')
  }

  const openEditProduct = (product: ProductRow) => {
    const activeSubcategoryIds = new Set(subcategories.filter((subcategory) => subcategory.active).map((subcategory) => subcategory.id))
    setProductName(product.name)
    setProductGroupName(product.group_name ?? '')
    setPrice(String(product.price))
    setProductCategoryId(product.category_id)
    setSelectedSubcategoryIds(product.subcategoryIds.filter((id) => activeSubcategoryIds.has(id)))
    setEditingProduct(product)
    setProductModalMode('edit')
  }

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !productCategoryId) return
    const name = productName.trim()
    const groupName = productGroupName.trim() || null
    const numericPrice = Number(price)
    if (!name) {
      setErrorMessage('กรุณาระบุชื่อสินค้า')
      return
    }
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setErrorMessage('ราคาต้องเป็นตัวเลขตั้งแต่ 0 บาทขึ้นไป')
      return
    }

    const action = productModalMode === 'create' ? 'create-product' : `edit-product-${editingProduct?.id ?? ''}`
    startAction(action)
    try {
      if (productModalMode === 'create') {
        const { error } = await supabase.rpc('create_product', {
          p_category_id: productCategoryId,
          p_name: name,
          p_price: numericPrice,
          p_group_name: groupName,
          p_subcategory_ids: selectedSubcategoryIds,
        })
        if (error) throw error
      } else if (editingProduct) {
        const { error } = await supabase.rpc('update_product', {
          p_product_id: editingProduct.id,
          p_category_id: productCategoryId,
          p_name: name,
          p_price: numericPrice,
          p_group_name: groupName,
          p_subcategory_ids: selectedSubcategoryIds,
        })
        if (error) throw error
      }
      invalidateProductsCache()
      resetProductForm()
      await refresh()
      finishAction(productModalMode === 'create' ? `เพิ่มสินค้า “${name}” แล้ว` : `บันทึกสินค้า “${name}” แล้ว`)
    } catch (error: unknown) { failAction(error) }
  }

  const saveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !editingCategory) return
    const name = editingName.trim()
    if (!name) {
      setErrorMessage('กรุณาระบุชื่อหมวดสินค้า')
      return
    }
    startAction(`edit-category-${editingCategory.id}`)
    try {
      const { error } = await supabase.from('categories').update({ name }).eq('id', editingCategory.id)
      if (error) throw error
      invalidateProductsCache()
      setEditingCategory(null)
      await refresh()
      finishAction(`บันทึกหมวด “${name}” แล้ว`)
    } catch (error: unknown) { failAction(error) }
  }

  const saveSubcategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !editingSubcategory || !editingSubcategoryCategoryId) return
    const name = editingName.trim()
    if (!name) {
      setErrorMessage('กรุณาระบุชื่อหัวข้อย่อย')
      return
    }
    startAction(`edit-subcategory-${editingSubcategory.id}`)
    try {
      const { error } = await supabase.from('subcategories').update({ category_id: editingSubcategoryCategoryId, name }).eq('id', editingSubcategory.id)
      if (error) throw error
      invalidateProductsCache()
      setEditingSubcategory(null)
      await refresh()
      finishAction(`บันทึกหัวข้อย่อย “${name}” แล้ว`)
    } catch (error: unknown) { failAction(error) }
  }

  const toggleProduct = async (product: ProductRow) => {
    if (!supabase) return
    startAction(`toggle-product-${product.id}`)
    try {
      const { error } = await supabase.from('products').update({ active: !product.active }).eq('id', product.id)
      if (error) throw error
      invalidateProductsCache()
      await refresh()
      finishAction(product.active ? `ปิดการขาย “${product.name}” แล้ว` : `เปิดขาย “${product.name}” แล้ว`)
    } catch (error: unknown) { failAction(error) }
  }

  const toggleProductFavorite = async (product: ProductRow) => {
    if (!supabase) return
    startAction(`toggle-product-favorite-${product.id}`)
    try {
      const { error } = await supabase.from('products').update({ is_favorite: !product.is_favorite }).eq('id', product.id)
      if (error) throw error
      invalidateProductsCache()
      await refresh()
      finishAction(product.is_favorite ? `นำ “${product.name}” ออกจากรายการโปรดแล้ว` : `เพิ่ม “${product.name}” เป็นรายการโปรดแล้ว`)
    } catch (error: unknown) { failAction(error) }
  }

  const deleteProduct = async () => {
    if (!supabase || !deletingProduct) return
    const product = deletingProduct
    startAction(`delete-product-${product.id}`)
    try {
      const { error } = await supabase.rpc('delete_product', { p_product_id: product.id })
      if (error) throw error
      invalidateProductsCache()
      setDeletingProduct(null)
      await refresh()
      finishAction(`ลบสินค้า “${product.name}” แล้ว`)
    } catch (error: unknown) { failAction(error) }
  }

  const toggleCategory = async (category: Category) => {
    if (!supabase) return
    startAction(`toggle-category-${category.id}`)
    try {
      const { error } = await supabase.from('categories').update({ active: !category.active }).eq('id', category.id)
      if (error) throw error
      invalidateProductsCache()
      await refresh()
      finishAction(category.active ? `ปิดใช้งานหมวด “${category.name}” แล้ว` : `เปิดใช้งานหมวด “${category.name}” แล้ว`)
    } catch (error: unknown) { failAction(error) }
  }

  const toggleSubcategory = async (subcategory: Subcategory) => {
    if (!supabase) return
    startAction(`toggle-subcategory-${subcategory.id}`)
    try {
      const { error } = await supabase.from('subcategories').update({ active: !subcategory.active }).eq('id', subcategory.id)
      if (error) throw error
      invalidateProductsCache()
      await refresh()
      finishAction(subcategory.active ? `ปิดใช้งานหัวข้อ “${subcategory.name}” แล้ว` : `เปิดใช้งานหัวข้อ “${subcategory.name}” แล้ว`)
    } catch (error: unknown) { failAction(error) }
  }

  const openCategoryEditor = (category: Category) => {
    setEditingCategory(category)
    setEditingName(category.name)
  }

  const openSubcategoryEditor = (subcategory: Subcategory) => {
    setEditingSubcategory(subcategory)
    setEditingName(subcategory.name)
    setEditingSubcategoryCategoryId(subcategory.category_id)
  }

  const tabItems: readonly { readonly id: CatalogTab; readonly label: string; readonly count: number }[] = [
    { id: 'products', label: 'สินค้า', count: products.length },
    { id: 'categories', label: 'หมวดหมู่', count: categories.length },
    { id: 'subcategories', label: 'หัวข้อย่อย', count: subcategories.length },
  ]

  return (
    <section className="manager-page">
      <header className="sales-heading manager-heading">
        <div><p className="eyebrow">MANAGER</p><h2>สินค้าและหมวดหมู่</h2><p className="muted">จัดการเมนูและโครงสร้างหมวดหมู่จากพื้นที่เดียว</p></div>
        <button className="secondary-button" disabled={isLoading || isSubmitting} onClick={() => void refresh()} type="button">↻ รีเฟรช</button>
      </header>

      {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
      {successMessage ? <p className="success-message" role="status">✓ {successMessage}</p> : null}

      <nav aria-label="ส่วนจัดการสินค้าและหมวดหมู่" className="catalog-tabs" role="tablist">
        {tabItems.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={`catalog-tab${activeTab === tab.id ? ' active' : ''}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            <span>{tab.label}</span><small>{tab.count}</small>
          </button>
        ))}
      </nav>

      {activeTab === 'products' ? (
        <>
          <section className="content-card catalog-toolbar">
            <div>
              <h3>รายการสินค้า</h3>
              <p className="muted">เพิ่มสินค้าใหม่หรือแก้ไขเมนูที่มีอยู่</p>
            </div>
            <button className="primary-button" disabled={isSubmitting || activeCategories.length === 0} onClick={openCreateProduct} type="button">+ เพิ่มสินค้า</button>
          </section>

          <section className="content-card">
            <div className="product-manager-filters">
              <label>ค้นหาสินค้าหรือหัวข้อ<input onChange={(event) => setProductSearch(event.target.value)} placeholder="เช่น แกงป่า หรือ หมู" type="search" value={productSearch} /></label>
              <label>กรองตามหมวด<select onChange={(event) => setProductCategoryFilter(event.target.value)} value={productCategoryFilter}><option value="ทั้งหมด">ทุกหมวด</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label>สถานะ<select onChange={(event) => setProductStatusFilter(event.target.value as 'ทั้งหมด' | 'เปิดขาย' | 'ปิดขาย')} value={productStatusFilter}><option value="ทั้งหมด">ทุกสถานะ</option><option value="เปิดขาย">เปิดขาย</option><option value="ปิดขาย">ปิดขาย</option></select></label>
            </div>
            <div className="section-heading manager-products-heading"><div><h3>สินค้า {filteredProducts.length === products.length ? `(${products.length})` : `(${filteredProducts.length}/${products.length})`}</h3><p className="muted">สินค้าที่ปิดขายจะไม่แสดงในหน้าขายหน้าร้าน · รายการโปรดจะแสดงก่อนในหน้าขาย</p></div></div>
            {isLoading ? <p className="muted">กำลังโหลด...</p> : products.length === 0 ? <p className="muted">ยังไม่มีสินค้า กด “+ เพิ่มสินค้า” เพื่อเริ่มต้น</p> : filteredProducts.length === 0 ? <div className="catalog-empty-state"><p className="muted">ไม่พบสินค้าที่ตรงกับตัวกรอง</p><button className="secondary-button" onClick={() => { setProductSearch(''); setProductCategoryFilter('ทั้งหมด'); setProductStatusFilter('ทั้งหมด') }} type="button">ล้างตัวกรอง</button></div> : <div className="product-manager-list">{filteredProducts.map((product) => <article className={!product.active ? 'inactive' : ''} key={product.id}><div><div className="manager-item-title"><strong>{product.name}</strong><span className={`status-pill ${product.active ? 'active' : 'inactive'}`}>{product.active ? 'เปิดขาย' : 'ปิดขาย'}</span></div><span>{categoryNameById.get(product.category_id) ?? 'ไม่ระบุหมวด'} · {formatPrice(product.price)} บาท</span><div className="manager-tag-list">{product.is_favorite ? <span className="manager-tag favorite">★ รายการโปรด</span> : null}{product.group_name ? <span className="manager-tag">กลุ่ม: {product.group_name}</span> : null}{product.subcategoryNames.length > 0 ? product.subcategoryNames.map((name) => <span className="manager-tag" key={`${product.id}-${name}`}>{name}</span>) : <small className="muted">ยังไม่มีหัวข้อย่อย</small>}</div></div><div className="inline-actions"><button aria-pressed={product.is_favorite} className={`secondary-button favorite-toggle${product.is_favorite ? ' active' : ''}`} disabled={isSubmitting} onClick={() => void toggleProductFavorite(product)} type="button">{product.is_favorite ? '★ รายการโปรด' : '☆ ตั้งโปรด'}</button><button className="secondary-button" disabled={isSubmitting} onClick={() => openEditProduct(product)} type="button">แก้ไข</button><button className="secondary-button" disabled={isSubmitting} onClick={() => void toggleProduct(product)} type="button">{product.active ? 'ปิดการขาย' : 'เปิดขาย'}</button><button className="danger-button" disabled={isSubmitting} onClick={() => setDeletingProduct(product)} type="button">ลบ</button></div></article>)}</div>}
          </section>
        </>
      ) : null}

      {activeTab === 'categories' ? (
        <section className="catalog-management-grid">
          <form className="content-card compact-form" onSubmit={(event) => void addCategory(event)}>
            <div><h3>เพิ่มหมวดหมู่</h3><p className="muted">เช่น อาหารจานเดียว, เครื่องดื่ม</p></div>
            <label>ชื่อหมวด<input onChange={(event) => setCategoryName(event.target.value)} placeholder="ชื่อหมวดสินค้า" required value={categoryName} /></label>
            <button className="primary-button" disabled={isSubmitting} type="submit">เพิ่มหมวดหมู่</button>
          </form>
          <section className="content-card catalog-entity-card"><div className="section-heading"><div><h3>หมวดหมู่ทั้งหมด ({categories.length})</h3><p className="muted">ปิดใช้งานหมวดที่ไม่ต้องการให้ใช้กับเมนูใหม่</p></div></div><div className="catalog-entity-list">{categories.length === 0 ? <p className="muted">ยังไม่มีหมวดหมู่</p> : categories.map((category) => <article className={!category.active ? 'inactive' : ''} key={category.id}><div><div className="manager-item-title"><strong>{category.name}</strong><span className={`status-pill ${category.active ? 'active' : 'inactive'}`}>{category.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></div><span>{productCountByCategory.get(category.id) ?? 0} สินค้า</span></div><div className="inline-actions"><button className="secondary-button" disabled={isSubmitting} onClick={() => openCategoryEditor(category)} type="button">แก้ไข</button><button className="secondary-button" disabled={isSubmitting} onClick={() => void toggleCategory(category)} type="button">{category.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button></div></article>)}</div></section>
        </section>
      ) : null}

      {activeTab === 'subcategories' ? (
        <section className="catalog-management-grid">
          <form className="content-card compact-form" onSubmit={(event) => void addSubcategory(event)}>
            <div><h3>เพิ่มหัวข้อย่อย</h3><p className="muted">ใช้ช่วยค้นหาเมนู เช่น หมู, ไก่, เผ็ด</p></div>
            <label>หมวดหลัก<select onChange={(event) => setSubcategoryCategoryId(event.target.value)} required value={subcategoryCategoryId}><option value="">เลือกหมวด</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label>ชื่อหัวข้อ<input onChange={(event) => setSubcategoryName(event.target.value)} placeholder="ชื่อหัวข้อย่อย" required value={subcategoryName} /></label>
            <button className="primary-button" disabled={isSubmitting || activeCategories.length === 0} type="submit">เพิ่มหัวข้อย่อย</button>
          </form>
          <section className="content-card catalog-entity-card"><div className="section-heading"><div><h3>หัวข้อย่อยทั้งหมด ({subcategories.length})</h3><p className="muted">เลือกหมวดเพื่อดูหัวข้อย่อยที่เกี่ยวข้อง</p></div></div><label className="catalog-list-filter">แสดงหัวข้อของหมวด<select onChange={(event) => setSubcategoryListCategoryId(event.target.value)} value={subcategoryListCategoryId}><option value="ทั้งหมด">ทุกหมวด</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><div className="catalog-entity-list">{filteredSubcategories.length === 0 ? <p className="muted">ยังไม่มีหัวข้อย่อย</p> : filteredSubcategories.map((subcategory) => <article className={!subcategory.active ? 'inactive' : ''} key={subcategory.id}><div><div className="manager-item-title"><strong>{subcategory.name}</strong><span className={`status-pill ${subcategory.active ? 'active' : 'inactive'}`}>{subcategory.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></div><span>{categoryNameById.get(subcategory.category_id) ?? 'ไม่ระบุหมวด'}</span></div><div className="inline-actions"><button className="secondary-button" disabled={isSubmitting} onClick={() => openSubcategoryEditor(subcategory)} type="button">แก้ไข</button><button className="secondary-button" disabled={isSubmitting} onClick={() => void toggleSubcategory(subcategory)} type="button">{subcategory.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button></div></article>)}</div></section>
        </section>
      ) : null}

      {productModalMode ? <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) resetProductForm() }}><form aria-labelledby="product-modal-title" aria-modal="true" className="dialog-card catalog-dialog" onSubmit={(event) => void saveProduct(event)} role="dialog"><div className="dialog-header"><div><p className="eyebrow">{productModalMode === 'create' ? 'เพิ่มเมนูใหม่' : 'แก้ไขเมนู'}</p><h3 id="product-modal-title">{productModalMode === 'create' ? 'เพิ่มสินค้า' : `แก้ไข ${editingProduct?.name ?? 'สินค้า'}`}</h3></div><button aria-label="ปิดหน้าต่าง" className="dialog-close-button" disabled={isSubmitting} onClick={resetProductForm} type="button">×</button></div><label>ชื่อสินค้า<input autoFocus onChange={(event) => setProductName(event.target.value)} required value={productName} /></label><label>กลุ่มเมนู (กำหนดเอง)<input list="product-group-options" onChange={(event) => setProductGroupName(event.target.value)} placeholder="เช่น แกงป่า" value={productGroupName} /><small className="muted">ชื่อกลุ่มเดียวกันจะจัดให้อยู่แถวเดียวกันบนหน้าขาย เว้นว่างเพื่อจัดไว้ใน “อื่นๆ”</small><datalist id="product-group-options">{productGroupOptions.map((groupName) => <option key={groupName} value={groupName} />)}</datalist></label><label>ราคา (บาท)<input inputMode="decimal" min="0" onChange={(event) => setPrice(event.target.value)} required step="0.01" type="number" value={price} /></label><label>หมวดหลัก<select disabled={productModalMode === 'edit'} onChange={(event) => { setProductCategoryId(event.target.value); setSelectedSubcategoryIds([]) }} required value={productCategoryId}><option value="">เลือกหมวด</option>{productCategoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}{!category.active ? ' (ปิดใช้งาน)' : ''}</option>)}</select>{productModalMode === 'edit' ? <small className="muted">หมวดหลักแก้ไขไม่ได้ในโหมดนี้ เพื่อรักษาความสัมพันธ์ของหัวข้อย่อย</small> : null}</label>{productCategoryId ? <fieldset className="subcategory-checkbox-list"><legend>หัวข้อย่อย <small>(เลือกได้หลายหัวข้อ)</small></legend>{activeProductSubcategories.length === 0 ? <span className="muted">หมวดนี้ยังไม่มีหัวข้อย่อย</span> : activeProductSubcategories.map((subcategory) => <label key={subcategory.id}><input checked={selectedSubcategoryIds.includes(subcategory.id)} onChange={(event) => setSelectedSubcategoryIds((current) => event.target.checked ? [...current, subcategory.id] : current.filter((id) => id !== subcategory.id))} type="checkbox" />{subcategory.name}</label>)}</fieldset> : null}<div className="dialog-actions"><button className="secondary-button" disabled={isSubmitting} onClick={resetProductForm} type="button">ยกเลิก</button><button className="primary-button" disabled={isSubmitting || productCategoryOptions.length === 0} type="submit">{isSubmitting ? 'กำลังบันทึก...' : productModalMode === 'create' ? 'เพิ่มสินค้า' : 'บันทึกการแก้ไข'}</button></div></form></div> : null}

      {deletingProduct ? <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) setDeletingProduct(null) }}><section aria-labelledby="delete-product-dialog-title" aria-modal="true" className="dialog-card catalog-dialog" role="dialog"><div className="dialog-header"><div><p className="eyebrow">ลบสินค้า</p><h3 id="delete-product-dialog-title">ยืนยันการลบสินค้า</h3></div><button aria-label="ปิดหน้าต่าง" className="dialog-close-button" disabled={isSubmitting} onClick={() => setDeletingProduct(null)} type="button">×</button></div><p>ต้องการลบ <strong>“{deletingProduct.name}”</strong> ใช่หรือไม่?</p><p className="muted">การลบถาวรจะทำได้เฉพาะสินค้าที่ยังไม่ถูกใช้ในรายการขายหรือรายการแก้ไขบิล หากเคยใช้งานแล้ว ให้เลือก “ปิดการขาย” แทน</p><div className="dialog-actions"><button className="secondary-button" disabled={isSubmitting} onClick={() => setDeletingProduct(null)} type="button">ยกเลิก</button><button className="danger-button" disabled={isSubmitting} onClick={() => void deleteProduct()} type="button">{isSubmitting ? 'กำลังลบ...' : 'ยืนยันลบสินค้า'}</button></div></section></div> : null}

      {editingCategory ? <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) setEditingCategory(null) }}><form aria-labelledby="category-modal-title" aria-modal="true" className="dialog-card catalog-dialog" onSubmit={(event) => void saveCategory(event)} role="dialog"><div className="dialog-header"><h3 id="category-modal-title">แก้ไขหมวดหมู่</h3><button aria-label="ปิดหน้าต่าง" className="dialog-close-button" disabled={isSubmitting} onClick={() => setEditingCategory(null)} type="button">×</button></div><label>ชื่อหมวด<input autoFocus onChange={(event) => setEditingName(event.target.value)} required value={editingName} /></label><div className="dialog-actions"><button className="secondary-button" disabled={isSubmitting} onClick={() => setEditingCategory(null)} type="button">ยกเลิก</button><button className="primary-button" disabled={isSubmitting} type="submit">บันทึก</button></div></form></div> : null}

      {editingSubcategory ? <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) setEditingSubcategory(null) }}><form aria-labelledby="subcategory-modal-title" aria-modal="true" className="dialog-card catalog-dialog" onSubmit={(event) => void saveSubcategory(event)} role="dialog"><div className="dialog-header"><h3 id="subcategory-modal-title">แก้ไขหัวข้อย่อย</h3><button aria-label="ปิดหน้าต่าง" className="dialog-close-button" disabled={isSubmitting} onClick={() => setEditingSubcategory(null)} type="button">×</button></div><label>หมวดหลัก<select onChange={(event) => setEditingSubcategoryCategoryId(event.target.value)} required value={editingSubcategoryCategoryId}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{!category.active ? ' (ปิดใช้งาน)' : ''}</option>)}</select></label><label>ชื่อหัวข้อ<input autoFocus onChange={(event) => setEditingName(event.target.value)} required value={editingName} /></label><div className="dialog-actions"><button className="secondary-button" disabled={isSubmitting} onClick={() => setEditingSubcategory(null)} type="button">ยกเลิก</button><button className="primary-button" disabled={isSubmitting} type="submit">บันทึก</button></div></form></div> : null}
    </section>
  )
}
