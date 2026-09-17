import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySalesDraft, readSalesDraft, updateSalesDraft } from './salesPersistence'

const storage = new Map<string, string>()
const localStorageMock: Storage = {
  get length() { return storage.size },
  clear: () => storage.clear(),
  getItem: (key) => storage.get(key) ?? null,
  key: (index) => Array.from(storage.keys())[index] ?? null,
  removeItem: (key) => { storage.delete(key) },
  setItem: (key, value) => { storage.set(key, value) },
}

describe('sales draft persistence', () => {
  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('window', { localStorage: localStorageMock })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores and restores the active sales screen state', () => {
    updateSalesDraft('user-1', {
      activeView: 'menu',
      searchQuery: 'กาแฟ',
      isMobileCartOpen: true,
      meatKeywordFilters: ['หมู', 'ไก่'],
      servingContainerFilters: ['ถ้วย'],
      riceSizeFilters: ['เล็ก'],
      orderId: 'order-1',
    })

    expect(readSalesDraft('user-1')).toMatchObject({
      activeView: 'menu',
      searchQuery: 'กาแฟ',
      isMobileCartOpen: true,
      meatKeywordFilters: ['หมู'],
      servingContainerFilters: ['ถ้วย'],
      riceSizeFilters: ['เล็ก'],
      orderId: 'order-1',
    })
  })

  it('provides safe defaults for drafts created before screen state was persisted', () => {
    const legacyDraft = createEmptySalesDraft()
    const { activeView: _activeView, searchQuery: _searchQuery, isMobileCartOpen: _isMobileCartOpen, meatKeywordFilters: _meatKeywordFilters, servingContainerFilters: _servingContainerFilters, riceSizeFilters: _riceSizeFilters, ...legacyFields } = legacyDraft
    storage.set('restaurant-pos.sales-workspace.v1.user-1', JSON.stringify(legacyFields))

    expect(readSalesDraft('user-1')).toMatchObject({
      activeView: 'tables',
      searchQuery: '',
      isMobileCartOpen: false,
      meatKeywordFilters: [],
      servingContainerFilters: [],
      riceSizeFilters: [],
    })
  })
})
