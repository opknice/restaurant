import { describe, expect, it } from 'vitest'
import { getFavoriteProducts } from './favoriteProducts'
import type { Product } from './salesTypes'

function product(id: string, name: string, price: number, isFavorite = false, categoryName = 'แกง'): Product {
  return {
    id,
    name,
    price,
    categoryId: `category-${categoryName}`,
    categoryName,
    groupName: null,
    isFavorite,
    subcategories: [],
  }
}

describe('getFavoriteProducts', () => {
  it('keeps only favorites and sorts them by price, then Thai name', () => {
    const favorites = getFavoriteProducts([
      product('pork', 'แกงป่าหมู', 80, true),
      product('chicken', 'แกงป่าไก่', 70, true),
      product('beef', 'แกงป่าเนื้อ', 80, true),
      product('regular', 'ข้าวสวย', 20),
    ])

    expect(favorites.map(({ name }) => name)).toEqual(['แกงป่าไก่', 'แกงป่าเนื้อ', 'แกงป่าหมู'])
  })

  it('accepts an already-filtered category without adding products from another category', () => {
    const selectedCategoryProducts = [product('curry', 'แกงเขียวหวานไก่', 80, true, 'แกง')]

    expect(getFavoriteProducts(selectedCategoryProducts).map(({ id }) => id)).toEqual(['curry'])
  })
})
