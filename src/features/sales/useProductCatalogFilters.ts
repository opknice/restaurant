import { useCallback, useMemo, useState } from 'react'
import type { Product, ProductGroup } from './salesTypes'
import { getFavoriteProducts } from './favoriteProducts'
import { matchesProductFilters } from './salesFilters'
import { getAnimalKeywordOptions, getRiceSizeOptions, getServingContainerOptions, isRiceSizeFilterAvailable, isServingContainerFilterAvailable, normalizeAnimalKeywordFilters, normalizeRiceSizeFilters, normalizeServingContainerFilters, type AnimalKeyword, type RiceSizeKeyword, type ServingContainerKeyword } from './meatKeywordFilters'
import { groupProductsByManagerGroup } from './productGrouping'

export interface ProductCatalogFilterOptions {
  readonly categoryFilter?: string
  readonly animalKeywordFilters?: readonly AnimalKeyword[]
  readonly servingContainerFilters?: readonly ServingContainerKeyword[]
  readonly riceSizeFilters?: readonly RiceSizeKeyword[]
  readonly searchQuery?: string
}

export interface ProductCatalogFilters {
  readonly categoryFilter: string
  readonly animalKeywordFilters: readonly AnimalKeyword[]
  readonly servingContainerFilters: readonly ServingContainerKeyword[]
  readonly riceSizeFilters: readonly RiceSizeKeyword[]
  readonly searchQuery: string
  readonly categories: readonly string[]
  readonly normalizedCategoryFilter: string
  readonly normalizedAnimalKeywordFilters: readonly AnimalKeyword[]
  readonly normalizedServingContainerFilters: readonly ServingContainerKeyword[]
  readonly normalizedRiceSizeFilters: readonly RiceSizeKeyword[]
  readonly categoryProductCounts: ReadonlyMap<string, number>
  readonly animalKeywordOptions: ReturnType<typeof getAnimalKeywordOptions>
  readonly servingContainerOptions: ReturnType<typeof getServingContainerOptions>
  readonly riceSizeOptions: ReturnType<typeof getRiceSizeOptions>
  readonly visibleProducts: readonly Product[]
  readonly favoriteProducts: readonly Product[]
  readonly productGroups: readonly ProductGroup[]
  readonly setSearchQuery: (value: string) => void
  readonly selectCategory: (value: string) => void
  readonly toggleAnimalKeyword: (value: AnimalKeyword) => void
  readonly toggleServingContainer: (value: ServingContainerKeyword) => void
  readonly toggleRiceSize: (value: RiceSizeKeyword) => void
  readonly clearAnimalKeywords: () => void
  readonly clearServingContainers: () => void
  readonly clearRiceSizes: () => void
  readonly reset: () => void
}

export function useProductCatalogFilters(
  products: readonly Product[],
  options: ProductCatalogFilterOptions = {},
): ProductCatalogFilters {
  const [categoryFilter, setCategoryFilter] = useState(options.categoryFilter ?? 'ทั้งหมด')
  const [animalKeywordFilters, setAnimalKeywordFilters] = useState<AnimalKeyword[]>(() => normalizeAnimalKeywordFilters(options.animalKeywordFilters ?? []))
  const [servingContainerFilters, setServingContainerFilters] = useState<ServingContainerKeyword[]>(() => normalizeServingContainerFilters(options.servingContainerFilters ?? []))
  const [riceSizeFilters, setRiceSizeFilters] = useState<RiceSizeKeyword[]>(() => normalizeRiceSizeFilters(options.riceSizeFilters ?? []))
  const [searchQuery, setSearchQuery] = useState(options.searchQuery ?? '')

  const categories = useMemo(() => ['ทั้งหมด', ...new Set(products.map((product) => product.categoryName))], [products])
  const normalizedCategoryFilter = categoryFilter === 'ทั้งหมด' || categories.includes(categoryFilter) ? categoryFilter : 'ทั้งหมด'
  const normalizedAnimalKeywordFilters = useMemo(() => normalizeAnimalKeywordFilters(animalKeywordFilters), [animalKeywordFilters])
  const normalizedServingContainerFilters = useMemo(
    () => isServingContainerFilterAvailable(normalizedCategoryFilter) ? normalizeServingContainerFilters(servingContainerFilters) : [],
    [normalizedCategoryFilter, servingContainerFilters],
  )
  const normalizedRiceSizeFilters = useMemo(
    () => isRiceSizeFilterAvailable(normalizedCategoryFilter) ? normalizeRiceSizeFilters(riceSizeFilters) : [],
    [normalizedCategoryFilter, riceSizeFilters],
  )

  const categoryProductCounts = useMemo(() => {
    const counts = new Map<string, number>([['ทั้งหมด', products.length]])
    for (const product of products) counts.set(product.categoryName, (counts.get(product.categoryName) ?? 0) + 1)
    return counts
  }, [products])

  const animalKeywordOptions = useMemo(
    () => getAnimalKeywordOptions(products, normalizedCategoryFilter),
    [normalizedCategoryFilter, products],
  )
  // Faceted counts apply the category, animal and search filters while leaving
  // the current filter group open, so each option remains discoverable.
  const facetedOptionProducts = useMemo(
    () => products.filter((product) => matchesProductFilters(product, normalizedCategoryFilter, normalizedAnimalKeywordFilters, [], [], searchQuery)),
    [normalizedAnimalKeywordFilters, normalizedCategoryFilter, products, searchQuery],
  )
  const servingContainerOptions = useMemo(
    () => getServingContainerOptions(facetedOptionProducts, normalizedCategoryFilter),
    [facetedOptionProducts, normalizedCategoryFilter],
  )
  const riceSizeOptions = useMemo(
    () => getRiceSizeOptions(facetedOptionProducts, normalizedCategoryFilter),
    [facetedOptionProducts, normalizedCategoryFilter],
  )
  const visibleProducts = useMemo(
    () => products.filter((product) => matchesProductFilters(product, normalizedCategoryFilter, normalizedAnimalKeywordFilters, normalizedServingContainerFilters, normalizedRiceSizeFilters, searchQuery)),
    [normalizedAnimalKeywordFilters, normalizedCategoryFilter, normalizedRiceSizeFilters, normalizedServingContainerFilters, products, searchQuery],
  )
  const favoriteProducts = useMemo(() => getFavoriteProducts(visibleProducts), [visibleProducts])
  const productGroups = useMemo(() => groupProductsByManagerGroup(visibleProducts), [visibleProducts])

  const selectCategory = useCallback((value: string) => {
    setCategoryFilter(value)
    setAnimalKeywordFilters([])
    setServingContainerFilters([])
    setRiceSizeFilters([])
  }, [])
  const toggleAnimalKeyword = useCallback((value: AnimalKeyword) => {
    setAnimalKeywordFilters((current) => current[0] === value ? [] : [value])
  }, [])
  const toggleServingContainer = useCallback((value: ServingContainerKeyword) => {
    setServingContainerFilters((current) => current[0] === value ? [] : [value])
  }, [])
  const toggleRiceSize = useCallback((value: RiceSizeKeyword) => {
    setRiceSizeFilters((current) => current[0] === value ? [] : [value])
  }, [])
  const reset = useCallback(() => {
    setCategoryFilter('ทั้งหมด')
    setAnimalKeywordFilters([])
    setServingContainerFilters([])
    setRiceSizeFilters([])
    setSearchQuery('')
  }, [])

  return {
    categoryFilter,
    animalKeywordFilters,
    servingContainerFilters,
    riceSizeFilters,
    searchQuery,
    categories,
    normalizedCategoryFilter,
    normalizedAnimalKeywordFilters,
    normalizedServingContainerFilters,
    normalizedRiceSizeFilters,
    categoryProductCounts,
    animalKeywordOptions,
    servingContainerOptions,
    riceSizeOptions,
    visibleProducts,
    favoriteProducts,
    productGroups,
    setSearchQuery,
    selectCategory,
    toggleAnimalKeyword,
    toggleServingContainer,
    toggleRiceSize,
    clearAnimalKeywords: () => setAnimalKeywordFilters([]),
    clearServingContainers: () => setServingContainerFilters([]),
    clearRiceSizes: () => setRiceSizeFilters([]),
    reset,
  }
}
