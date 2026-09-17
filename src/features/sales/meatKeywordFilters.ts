import type { Product } from './salesTypes'

/** Animal filters available across the POS catalog. */
export const ANIMAL_KEYWORDS = ['ไก่', 'หมู', 'เนื้อ', 'กุ้ง', 'ปลา', 'ปลาหมึก', 'ปู', 'หอย', 'กบ', 'ทะเล'] as const

/** Serving-container filters available only in the soup and curry categories. */
export const SERVING_CONTAINER_KEYWORDS = ['ถ้วย', 'หม้อ'] as const

/** Portion-size filters available only in the rice category. */
export const RICE_SIZE_KEYWORDS = ['เล็ก', 'กลาง', 'ใหญ่'] as const

export type AnimalKeyword = (typeof ANIMAL_KEYWORDS)[number]
export type ServingContainerKeyword = (typeof SERVING_CONTAINER_KEYWORDS)[number]
export type RiceSizeKeyword = (typeof RICE_SIZE_KEYWORDS)[number]
type ProductKeyword = AnimalKeyword | ServingContainerKeyword | RiceSizeKeyword

export interface KeywordOption<TKeyword extends string> {
  readonly keyword: TKeyword
  readonly productCount: number
}

const NON_FISH_PRODUCT_TERMS = ['ปลาหมึก', 'น้ำปลา', 'ปลาร้า', 'เต้าหู้ปลา'] as const

function containsPrimaryFish(name: string): boolean {
  const nameWithoutNonFishTerms = NON_FISH_PRODUCT_TERMS.reduce(
    (currentName, term) => currentName.replaceAll(term, ''),
    name,
  )
  return nameWithoutNonFishTerms.includes('ปลา')
}

const keywordMatchers: Readonly<Record<ProductKeyword, (name: string) => boolean>> = {
  ไก่: (name) => name.includes('ไก่'),
  หมู: (name) => name.includes('หมู'),
  เนื้อ: (name) => name.includes('เนื้อ'),
  กุ้ง: (name) => name.includes('กุ้ง'),
  // Exclude fish-derived product names and the more specific squid keyword.
  ปลา: containsPrimaryFish,
  ปลาหมึก: (name) => name.includes('ปลาหมึก'),
  // Avoid matching the drink name "คาปูชิโน่".
  ปู: (name) => name.includes('ปู') && !name.includes('คาปูชิโน่'),
  // "น้ำมันหอย" is a sauce ingredient, not a shellfish menu item.
  หอย: (name) => name.includes('หอย') && !name.includes('น้ำมันหอย'),
  // Avoid the accidental cross-word match in "เค้กบราวนี่...".
  กบ: (name) => name.includes('กบ') && !name.includes('เค้ก'),
  ทะเล: (name) => name.includes('ทะเล'),
  ถ้วย: (name) => name.includes('ถ้วย'),
  หม้อ: (name) => name.includes('หม้อ'),
  เล็ก: (name) => name.includes('เล็ก'),
  กลาง: (name) => name.includes('กลาง'),
  ใหญ่: (name) => name.includes('ใหญ่'),
}

function normalizeProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '')
}

export function isAnimalKeyword(value: unknown): value is AnimalKeyword {
  return typeof value === 'string' && (ANIMAL_KEYWORDS as readonly string[]).includes(value)
}

export function isServingContainerKeyword(value: unknown): value is ServingContainerKeyword {
  return typeof value === 'string' && (SERVING_CONTAINER_KEYWORDS as readonly string[]).includes(value)
}

export function isRiceSizeKeyword(value: unknown): value is RiceSizeKeyword {
  return typeof value === 'string' && (RICE_SIZE_KEYWORDS as readonly string[]).includes(value)
}

export function normalizeAnimalKeywordFilters(values: readonly AnimalKeyword[]): AnimalKeyword[] {
  const validValues = [...new Set(values)].filter(isAnimalKeyword)
  return validValues.length > 0 ? [validValues[0]] : []
}

export function normalizeServingContainerFilters(values: readonly ServingContainerKeyword[]): ServingContainerKeyword[] {
  const validValues = [...new Set(values)].filter(isServingContainerKeyword)
  return validValues.length > 0 ? [validValues[0]] : []
}

export function normalizeRiceSizeFilters(values: readonly RiceSizeKeyword[]): RiceSizeKeyword[] {
  const validValues = [...new Set(values)].filter(isRiceSizeKeyword)
  return validValues.length > 0 ? [validValues[0]] : []
}

function getProductKeywords<TKeyword extends ProductKeyword>(product: Pick<Product, 'name'>, keywords: readonly TKeyword[]): TKeyword[] {
  const name = normalizeProductName(product.name)
  return keywords.filter((keyword) => keywordMatchers[keyword](name))
}

export function getProductAnimalKeywords(product: Pick<Product, 'name'>): AnimalKeyword[] {
  return getProductKeywords(product, ANIMAL_KEYWORDS)
}

export function getProductServingContainerKeywords(product: Pick<Product, 'name'>): ServingContainerKeyword[] {
  return getProductKeywords(product, SERVING_CONTAINER_KEYWORDS)
}

export function getProductRiceSizeKeywords(product: Pick<Product, 'name'>): RiceSizeKeyword[] {
  return getProductKeywords(product, RICE_SIZE_KEYWORDS)
}

export function isServingContainerFilterAvailable(categoryFilter: string): boolean {
  return categoryFilter === 'ต้ม' || categoryFilter === 'แกง'
}

export function isRiceSizeFilterAvailable(categoryFilter: string): boolean {
  return categoryFilter === 'ข้าว'
}

function getKeywordOptions<TKeyword extends ProductKeyword>(
  products: readonly Product[],
  categoryFilter: string,
  keywords: readonly TKeyword[],
): KeywordOption<TKeyword>[] {
  const counts = new Map<TKeyword, number>()

  for (const product of products) {
    if (categoryFilter !== 'ทั้งหมด' && product.categoryName !== categoryFilter) continue
    for (const keyword of getProductKeywords(product, keywords)) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1)
    }
  }

  // Keep the UI order stable and hide filters that have no matching products.
  return keywords
    .filter((keyword) => (counts.get(keyword) ?? 0) > 0)
    .map((keyword) => ({ keyword, productCount: counts.get(keyword) ?? 0 }))
}

export function getAnimalKeywordOptions(products: readonly Product[], categoryFilter: string): KeywordOption<AnimalKeyword>[] {
  return getKeywordOptions(products, categoryFilter, ANIMAL_KEYWORDS)
}

export function getServingContainerOptions(products: readonly Product[], categoryFilter: string): KeywordOption<ServingContainerKeyword>[] {
  if (!isServingContainerFilterAvailable(categoryFilter)) return []
  return getKeywordOptions(products, categoryFilter, SERVING_CONTAINER_KEYWORDS)
}

export function getRiceSizeOptions(products: readonly Product[], categoryFilter: string): KeywordOption<RiceSizeKeyword>[] {
  if (!isRiceSizeFilterAvailable(categoryFilter)) return []
  return getKeywordOptions(products, categoryFilter, RICE_SIZE_KEYWORDS)
}
