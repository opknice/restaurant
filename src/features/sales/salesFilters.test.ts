import { describe, expect, it } from 'vitest'
import { matchesProductFilters } from './salesFilters'
import type { Product } from './salesTypes'

const tomYam: Product = {
  id: 'product-1',
  name: 'ต้มยำรวมมิตร',
  price: 120,
  categoryId: 'category-boil',
  categoryName: 'ต้ม',
  groupName: null,
  isFavorite: false,
  subcategories: [
    { id: 'sub-pork', name: 'หมู' },
    { id: 'sub-chicken', name: 'ไก่' },
  ],
}

describe('product filters', () => {
  it('matches a product when its name contains any selected meat keyword', () => {
    expect(matchesProductFilters({ ...tomYam, name: 'ต้มยำหมู' }, 'ต้ม', ['หมู', 'เนื้อ'], [], [], '')).toBe(true)
    expect(matchesProductFilters({ ...tomYam, name: 'ต้มยำกุ้ง' }, 'ต้ม', ['หมู', 'เนื้อ'], [], [], '')).toBe(false)
  })

  it('applies meat filters even when all food categories are selected', () => {
    expect(matchesProductFilters({ ...tomYam, name: 'ต้มยำหมู' }, 'ทั้งหมด', ['หมู'], [], [], '')).toBe(true)
    expect(matchesProductFilters({ ...tomYam, name: 'ต้มยำกุ้ง' }, 'ทั้งหมด', ['หมู'], [], [], '')).toBe(false)
  })

  it('combines category, meat keyword, and text search filters', () => {
    expect(matchesProductFilters({ ...tomYam, name: 'ต้มยำไก่รวม' }, 'ต้ม', ['ไก่'], [], [], 'รวม')).toBe(true)
    expect(matchesProductFilters({ ...tomYam, name: 'ต้มยำไก่รวม' }, 'ผัด', ['ไก่'], [], [], 'รวม')).toBe(false)
    expect(matchesProductFilters({ ...tomYam, name: 'ต้มยำไก่รวม' }, 'ต้ม', ['ไก่'], [], [], 'กาแฟ')).toBe(false)
  })

  it('matches a manager-defined group name in text search', () => {
    expect(matchesProductFilters({ ...tomYam, groupName: 'เมนูแนะนำ' }, 'ต้ม', [], [], [], 'แนะนำ')).toBe(true)
  })

  it('supports the separate sea keyword', () => {
    expect(matchesProductFilters({ ...tomYam, name: 'ต้มยำทะเล' }, 'ต้ม', ['ทะเล'], [], [], '')).toBe(true)
    expect(matchesProductFilters({ ...tomYam, name: 'ต้มยำกุ้ง' }, 'ต้ม', ['ทะเล'], [], [], '')).toBe(false)
  })

  it('combines animal and serving-container filters with AND logic', () => {
    expect(matchesProductFilters({ ...tomYam, name: 'ต้มยำหมูถ้วย' }, 'ต้ม', ['หมู'], ['ถ้วย'], [], '')).toBe(true)
    expect(matchesProductFilters({ ...tomYam, name: 'ต้มยำกุ้งหม้อ' }, 'ต้ม', ['หมู'], ['หม้อ'], [], '')).toBe(false)
    expect(matchesProductFilters({ ...tomYam, name: 'ต้มยำหมูหม้อ' }, 'ต้ม', ['หมู'], ['ถ้วย'], [], '')).toBe(false)
  })

  it('combines animal and rice-size filters with AND logic', () => {
    expect(matchesProductFilters({ ...tomYam, name: 'ข้าวหมูเล็ก', categoryName: 'ข้าว' }, 'ข้าว', ['หมู'], [], ['เล็ก'], '')).toBe(true)
    expect(matchesProductFilters({ ...tomYam, name: 'ข้าวหมูกลาง', categoryName: 'ข้าว' }, 'ข้าว', ['หมู'], [], ['เล็ก'], '')).toBe(false)
    expect(matchesProductFilters({ ...tomYam, name: 'ข้าวไก่เล็ก', categoryName: 'ข้าว' }, 'ข้าว', ['หมู'], [], ['เล็ก'], '')).toBe(false)
  })
})
