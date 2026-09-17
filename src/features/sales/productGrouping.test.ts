import { describe, expect, it } from 'vitest'
import { DEFAULT_PRODUCT_GROUP_NAME, groupProductsByManagerGroup } from './productGrouping'
import type { Product } from './salesTypes'

function product(id: string, name: string, price: number, groupName: string | null = null): Product {
  return {
    id,
    name,
    price,
    categoryId: 'category-1',
    categoryName: 'อาหารไทย',
    groupName,
    isFavorite: false,
    subcategories: [],
  }
}

describe('groupProductsByManagerGroup', () => {
  it('uses the manager-defined group and sorts products by ascending price', () => {
    const groups = groupProductsByManagerGroup([
      product('beef', 'แกงป่าเนื้อ', 90, 'แกงป่า'),
      product('chicken', 'แกงป่าไก่', 70, 'แกงป่า'),
      product('pork', 'แกงป่าหมู', 80, 'แกงป่า'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBe('แกงป่า')
    expect(groups[0]?.products.map(({ name }) => name)).toEqual(['แกงป่าไก่', 'แกงป่าหมู', 'แกงป่าเนื้อ'])
  })

  it('does not infer groups from product names', () => {
    const groups = groupProductsByManagerGroup([
      product('crispy-pork', 'ผัดกะเพราหมูกรอบ', 80),
      product('minced-pork', 'ผัดกะเพราหมูสับ', 70),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBe(DEFAULT_PRODUCT_GROUP_NAME)
    expect(groups[0]?.products.map(({ name }) => name)).toEqual(['ผัดกะเพราหมูสับ', 'ผัดกะเพราหมูกรอบ'])
  })

  it('keeps separately assigned groups separate even when names look related', () => {
    const groups = groupProductsByManagerGroup([
      product('chicken', 'แกงเขียวหวานไก่', 70, 'แกงเขียวหวาน'),
      product('pork', 'แกงเขียวหวานหมู', 80, 'เมนูแนะนำ'),
    ])

    expect(groups.map(({ name }) => name)).toEqual(['แกงเขียวหวาน', 'เมนูแนะนำ'])
  })

  it('uses the product name as a stable tie breaker for equal prices', () => {
    const groups = groupProductsByManagerGroup([
      product('pork', 'แกงเขียวหวานหมู', 80, 'แกงเขียวหวาน'),
      product('chicken', 'แกงเขียวหวานไก่', 80, 'แกงเขียวหวาน'),
    ])

    expect(groups[0]?.products.map(({ name }) => name)).toEqual(['แกงเขียวหวานไก่', 'แกงเขียวหวานหมู'])
  })
})
