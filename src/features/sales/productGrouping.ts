import type { Product, ProductGroup } from './salesTypes'

export const DEFAULT_PRODUCT_GROUP_NAME = 'อื่นๆ'
const thaiCollator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' })

function compareProducts(left: Product, right: Product): number {
  return left.price - right.price || thaiCollator.compare(left.name, right.name)
}

function normalizeGroupName(groupName: string | null): string {
  return groupName?.normalize('NFC').replace(/\s+/g, ' ').trim() || DEFAULT_PRODUCT_GROUP_NAME
}

export function groupProductsByManagerGroup(products: readonly Product[]): readonly ProductGroup[] {
  const buckets = new Map<string, Product[]>()

  for (const product of products) {
    const groupName = normalizeGroupName(product.groupName)
    const current = buckets.get(groupName) ?? []
    current.push(product)
    buckets.set(groupName, current)
  }

  return Array.from(buckets, ([groupName, groupProducts]) => ({
    id: `product-group-${encodeURIComponent(groupName.toLocaleLowerCase('th-TH'))}`,
    name: groupName,
    products: [...groupProducts].sort(compareProducts),
  })).sort((left, right) => {
    if (left.name === DEFAULT_PRODUCT_GROUP_NAME) return 1
    if (right.name === DEFAULT_PRODUCT_GROUP_NAME) return -1
    return thaiCollator.compare(left.name, right.name)
  })
}
