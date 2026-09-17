import { useId } from 'react'
import type { ProductGroup } from './salesTypes'
import type { ProductCatalogFilters } from './useProductCatalogFilters'

const currencyFormatter = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
const EMPTY_CART_QUANTITIES: ReadonlyMap<string | null, number> = new Map()

function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

export interface ProductCatalogProps {
  readonly filters: ProductCatalogFilters
  readonly cartQuantityByProductId?: ReadonlyMap<string | null, number>
  readonly isSubmitting: boolean
  readonly onAddProduct: (productId: string) => void
}

export function ProductCatalog({ filters, cartQuantityByProductId = EMPTY_CART_QUANTITIES, isSubmitting, onAddProduct }: ProductCatalogProps) {
  const searchInputId = useId()

  return (
    <>
      <div className="pos-search-bar">
        <label className="sr-only" htmlFor={searchInputId}>ค้นหาอาหารหรือเครื่องดื่ม</label>
        <span aria-hidden="true" className="search-icon">🔍</span>
        <input
          id={searchInputId}
          className="search-touch-input"
          onChange={(event) => filters.setSearchQuery(event.target.value)}
          placeholder="ค้นหาชื่ออาหารหรือเครื่องดื่ม..."
          type="search"
          value={filters.searchQuery}
        />
        {filters.searchQuery ? <button aria-label="ล้างคำค้นหา" className="search-clear-button" onClick={() => filters.setSearchQuery('')} type="button">ล้าง</button> : null}
      </div>

      <section aria-label="ตัวกรองรายการอาหาร" className="pos-filter-panel">
        <div className="pos-filter-heading">
          <div><span className="pos-filter-kicker">กรองเมนู</span><strong>เลือกหมวดอาหาร</strong></div>
          <span className="pos-filter-result">{filters.visibleProducts.length} รายการ</span>
        </div>
        <div aria-label="หมวดหมู่สินค้า" className="pos-category-scroll" role="tablist">
          {filters.categories.map((category) => (
            <button key={category} aria-selected={filters.normalizedCategoryFilter === category} className={`category-pill ${filters.normalizedCategoryFilter === category ? 'active' : ''}`} onClick={() => filters.selectCategory(category)} role="tab" type="button">
              <span>{category}</span><small> ({filters.categoryProductCounts.get(category) ?? 0})</small>
            </button>
          ))}
        </div>
        <FilterRow
          ariaLabel="กรองตามเนื้อสัตว์"
          clearLabel="ล้างตัวกรอง"
          heading="กรองตามเนื้อสัตว์"
          options={filters.animalKeywordOptions}
          selected={filters.normalizedAnimalKeywordFilters}
          onClear={filters.clearAnimalKeywords}
          onToggle={filters.toggleAnimalKeyword}
          subheading="เลือกได้ 1 รายการ"
        />
        {filters.servingContainerOptions.length > 0 ? (
          <FilterRow
            ariaLabel="กรองภาชนะ"
            className="pos-serving-container-filter"
            clearLabel="ล้างตัวกรอง"
            heading="กรองภาชนะ"
            options={filters.servingContainerOptions}
            selected={filters.normalizedServingContainerFilters}
            onClear={filters.clearServingContainers}
            onToggle={filters.toggleServingContainer}
            subheading="เฉพาะถ้วยและหม้อ · ใช้ร่วมกับตัวกรองเนื้อสัตว์"
          />
        ) : null}
        {filters.riceSizeOptions.length > 0 ? (
          <FilterRow
            ariaLabel="กรองขนาดข้าว"
            className="pos-rice-size-filter"
            clearLabel="ล้างตัวกรอง"
            heading="กรองขนาดข้าว"
            options={filters.riceSizeOptions}
            selected={filters.normalizedRiceSizeFilters}
            onClear={filters.clearRiceSizes}
            onToggle={filters.toggleRiceSize}
            subheading="เลือกได้ 1 รายการ · ใช้ร่วมกับตัวกรองเนื้อสัตว์"
          />
        ) : null}
      </section>

      {filters.visibleProducts.length === 0 ? (
        <div className="pos-empty-state">
          <p>{filters.searchQuery ? `ไม่พบรายการที่ค้นหา “${filters.searchQuery}”` : 'ไม่พบสินค้าที่ตรงกับตัวกรองนี้'}</p>
          <button className="secondary-touch-button" onClick={filters.reset} type="button">ดูสินค้าทั้งหมด</button>
        </div>
      ) : null}

      {filters.favoriteProducts.length > 0 ? (
        <section aria-label="รายการโปรด" className="pos-favorite-section">
          <ProductGroupSection
            cartQuantityByProductId={cartQuantityByProductId}
            group={{ id: 'favorite-products', name: `★ รายการโปรด (${filters.favoriteProducts.length})`, products: filters.favoriteProducts }}
            isFavoriteSection
            isSubmitting={isSubmitting}
            onAddProduct={onAddProduct}
          />
        </section>
      ) : null}

      <div className="pos-product-grid">
        {filters.productGroups.map((group) => <ProductGroupSection cartQuantityByProductId={cartQuantityByProductId} group={group} isSubmitting={isSubmitting} key={group.id} onAddProduct={onAddProduct} />)}
      </div>
    </>
  )
}

interface FilterRowProps<TKeyword extends string> {
  readonly ariaLabel: string
  readonly className?: string
  readonly clearLabel: string
  readonly heading: string
  readonly options: readonly { readonly keyword: TKeyword; readonly productCount: number }[]
  readonly selected: readonly TKeyword[]
  readonly subheading: string
  readonly onClear: () => void
  readonly onToggle: (keyword: TKeyword) => void
}

function FilterRow<TKeyword extends string>({ ariaLabel, className, clearLabel, heading, options, selected, subheading, onClear, onToggle }: FilterRowProps<TKeyword>) {
  return (
    <div className={`pos-subcategory-filter${className ? ` ${className}` : ''}`}>
      <div className="pos-subcategory-heading">
        <span><strong>{heading}</strong><small>{subheading}</small></span>
        {selected.length > 0 ? <button className="filter-clear-button" onClick={onClear} type="button">{clearLabel}</button> : null}
      </div>
      {options.length > 0 ? (
        <>
          <div aria-label={ariaLabel} className="pos-subcategory-scroll" role="group">
            <button aria-pressed={selected.length === 0} className={`subcategory-pill ${selected.length === 0 ? 'active' : ''}`} onClick={onClear} type="button">ทั้งหมด</button>
            {options.map((option) => <button key={option.keyword} aria-pressed={selected.includes(option.keyword)} className={`subcategory-pill ${selected.includes(option.keyword) ? 'active' : ''}`} onClick={() => onToggle(option.keyword)} type="button">{option.keyword} <small>{option.productCount}</small></button>)}
          </div>
          {selected.length > 0 ? <div aria-label={`${ariaLabel}ที่เลือก`} className="pos-selected-filters"><span>เลือกแล้ว:</span>{selected.map((keyword) => <button className="selected-filter-chip" key={keyword} onClick={onClear} type="button">{keyword} ×</button>)}</div> : null}
        </>
      ) : <p className="pos-filter-empty">ยังไม่มีรายการที่ตรงกับตัวกรอง</p>}
    </div>
  )
}

interface ProductGroupSectionProps {
  readonly cartQuantityByProductId: ReadonlyMap<string | null, number>
  readonly group: ProductGroup
  readonly isFavoriteSection?: boolean
  readonly isSubmitting: boolean
  readonly onAddProduct: (productId: string) => void
}

function ProductGroupSection({ cartQuantityByProductId, group, isFavoriteSection = false, isSubmitting, onAddProduct }: ProductGroupSectionProps) {
  return (
    <section aria-label={`กลุ่มเมนู ${group.name}`} className={`pos-product-group${isFavoriteSection ? ' favorite' : ''}`}>
      <h3 className="pos-product-group-title">{group.name}</h3>
      <div className="pos-product-row">
        {group.products.map((product) => {
          const inCartCount = cartQuantityByProductId.get(product.id) ?? 0
          return <button key={product.id} aria-label={`${product.name} ราคา ${formatCurrency(product.price)}${inCartCount > 0 ? ` ในบิลแล้ว ${inCartCount} ชิ้น` : ''}`} className={`product-touch-card ${inCartCount > 0 ? 'in-cart' : ''}`} disabled={isSubmitting} onClick={() => onAddProduct(product.id)} type="button">
            {inCartCount > 0 ? <span className="product-cart-badge">{inCartCount}</span> : null}
            <span className="product-name">{product.name}</span>
            <strong className="product-price">{formatCurrency(product.price)}</strong>
          </button>
        })}
      </div>
    </section>
  )
}
