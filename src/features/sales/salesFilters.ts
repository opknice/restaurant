import type { Product } from './salesTypes'
import { getProductAnimalKeywords, getProductRiceSizeKeywords, getProductServingContainerKeywords, type AnimalKeyword, type RiceSizeKeyword, type ServingContainerKeyword } from './meatKeywordFilters'

export function matchesProductFilters(
  product: Product,
  categoryFilter: string,
  animalKeywordFilters: readonly AnimalKeyword[],
  servingContainerFilters: readonly ServingContainerKeyword[],
  riceSizeFilters: readonly RiceSizeKeyword[],
  searchQuery: string,
): boolean {
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const matchCategory = categoryFilter === 'ทั้งหมด' || product.categoryName === categoryFilter
  const matchAnimalKeyword = animalKeywordFilters.length === 0
    || animalKeywordFilters.some((keyword) => getProductAnimalKeywords(product).includes(keyword))
  const matchServingContainer = servingContainerFilters.length === 0
    || servingContainerFilters.some((keyword) => getProductServingContainerKeywords(product).includes(keyword))
  const matchRiceSize = riceSizeFilters.length === 0
    || riceSizeFilters.some((keyword) => getProductRiceSizeKeywords(product).includes(keyword))
  const matchSearch = !normalizedQuery
    || product.name.toLowerCase().includes(normalizedQuery)
    || product.groupName?.toLowerCase().includes(normalizedQuery) === true
  return matchCategory && matchAnimalKeyword && matchServingContainer && matchRiceSize && matchSearch
}
