import { describe, expect, it } from 'vitest'
import { getAnimalKeywordOptions, getProductAnimalKeywords, getProductRiceSizeKeywords, getProductServingContainerKeywords, getRiceSizeOptions, getServingContainerOptions } from './meatKeywordFilters'
import { matchesProductFilters } from './salesFilters'
import type { Product } from './salesTypes'

describe('meat keyword detection', () => {
  it('prefers the specific squid keyword instead of the generic fish keyword', () => {
    expect(getProductAnimalKeywords({ name: 'ต้มยำปลาหมึก' })).toEqual(['ปลาหมึก'])
  })

  it('detects fish species while excluding fish-derived menu terms', () => {
    expect(getProductAnimalKeywords({ name: 'ปลากะพงทอดน้ำปลา' })).toEqual(['ปลา'])
    expect(getProductAnimalKeywords({ name: 'ส้มตำปลาร้า' })).toEqual([])
    expect(getProductAnimalKeywords({ name: 'เต้าหู้ปลาทอด' })).toEqual([])
  })

  it('does not treat unrelated words as crab, frog, or shellfish', () => {
    expect(getProductAnimalKeywords({ name: 'คาปูชิโน่/เย็น' })).toEqual([])
    expect(getProductAnimalKeywords({ name: 'เค้กบราวนี่วิปปิ้งครีม' })).toEqual([])
    expect(getProductAnimalKeywords({ name: 'ผัดยอดฟักแม้วน้ำมันหอย' })).toEqual([])
  })

  it('can detect multiple primary animals in a combined menu name', () => {
    expect(getProductAnimalKeywords({ name: 'ส้มตำปู/หอยดอง' })).toEqual(['ปู', 'หอย'])
  })

  it('detects serving containers and shows them only for soup and curry categories', () => {
    const soupInCup: Product = { id: 'soup', name: 'ต้มยำหมูถ้วย', price: 80, categoryId: 'boil', categoryName: 'ต้ม', groupName: null, isFavorite: false, subcategories: [] }
    const curryInPot: Product = { id: 'curry', name: 'แกงป่าหม้อ', price: 180, categoryId: 'curry', categoryName: 'แกง', groupName: null, isFavorite: false, subcategories: [] }

    expect(getProductAnimalKeywords(soupInCup)).toEqual(['หมู'])
    expect(getProductServingContainerKeywords(soupInCup)).toEqual(['ถ้วย'])
    expect(getAnimalKeywordOptions([soupInCup, curryInPot], 'ต้ม').map(({ keyword }) => keyword)).toEqual(['หมู'])
    expect(getServingContainerOptions([soupInCup, curryInPot], 'ต้ม').map(({ keyword }) => keyword)).toEqual(['ถ้วย'])
    expect(getServingContainerOptions([soupInCup, curryInPot], 'แกง').map(({ keyword }) => keyword)).toEqual(['หม้อ'])
    expect(getServingContainerOptions([soupInCup, curryInPot], 'ผัด')).toEqual([])
  })

  it('detects rice sizes and shows them only for the rice category', () => {
    const porkSmallRice: Product = { id: 'rice-small', name: 'ข้าวหมูเล็ก', price: 60, categoryId: 'rice', categoryName: 'ข้าว', groupName: null, isFavorite: false, subcategories: [] }
    const porkLargeRice: Product = { id: 'rice-large', name: 'ข้าวหมูใหญ่', price: 80, categoryId: 'rice', categoryName: 'ข้าว', groupName: null, isFavorite: false, subcategories: [] }

    expect(getProductRiceSizeKeywords(porkSmallRice)).toEqual(['เล็ก'])
    expect(getRiceSizeOptions([porkSmallRice, porkLargeRice], 'ข้าว').map(({ keyword }) => keyword)).toEqual(['เล็ก', 'ใหญ่'])
    expect(getRiceSizeOptions([porkSmallRice, porkLargeRice], 'แกง')).toEqual([])
  })

  it('counts rice sizes from the latest selected animal filter', () => {
    const products: Product[] = [
      { id: 'pork-small', name: 'ข้าวหมูเล็ก', price: 60, categoryId: 'rice', categoryName: 'ข้าว', groupName: null, isFavorite: false, subcategories: [] },
      { id: 'pork-large', name: 'ข้าวหมูใหญ่', price: 80, categoryId: 'rice', categoryName: 'ข้าว', groupName: null, isFavorite: false, subcategories: [] },
      { id: 'chicken-small', name: 'ข้าวไก่เล็ก', price: 60, categoryId: 'rice', categoryName: 'ข้าว', groupName: null, isFavorite: false, subcategories: [] },
    ]
    const porkProducts = products.filter((product) => matchesProductFilters(product, 'ข้าว', ['หมู'], [], [], ''))

    expect(getRiceSizeOptions(porkProducts, 'ข้าว')).toEqual([
      { keyword: 'เล็ก', productCount: 1 },
      { keyword: 'ใหญ่', productCount: 1 },
    ])
  })

  it('counts serving containers from the latest selected animal filter', () => {
    const products: Product[] = [
      { id: 'pork-cup', name: 'ต้มยำหมูถ้วย', price: 80, categoryId: 'boil', categoryName: 'ต้ม', groupName: null, isFavorite: false, subcategories: [] },
      { id: 'pork-pot', name: 'ต้มยำหมูหม้อ', price: 180, categoryId: 'boil', categoryName: 'ต้ม', groupName: null, isFavorite: false, subcategories: [] },
      { id: 'chicken-cup', name: 'ต้มยำไก่ถ้วย', price: 80, categoryId: 'boil', categoryName: 'ต้ม', groupName: null, isFavorite: false, subcategories: [] },
    ]
    const porkProducts = products.filter((product) => matchesProductFilters(product, 'ต้ม', ['หมู'], [], [], ''))

    expect(getServingContainerOptions(porkProducts, 'ต้ม')).toEqual([
      { keyword: 'ถ้วย', productCount: 1 },
      { keyword: 'หม้อ', productCount: 1 },
    ])
  })
})
