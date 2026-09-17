import type { Product } from './salesTypes'

const productNameCollator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' })

/**
 * Builds the shared POS quick-access list from an already-filtered catalog.
 * Callers retain their selected category, meat filters, and text search.
 */
export function getFavoriteProducts(products: readonly Product[]): Product[] {
  return products
    .filter((product) => product.isFavorite)
    .sort((left, right) => left.price - right.price || productNameCollator.compare(left.name, right.name))
}
