import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePreferencesStore } from './preferences-store'

// Mock the storage functions
vi.mock('./preferences-storage', () => ({
  setPreference: vi.fn(),
  getAllPreferences: vi.fn(() => ({
    sidebar_variant: 'inset',
    sidebar_collapsible: 'icon',
    content_layout: 'centered',
    navbar_style: 'sticky',
    theme_preset: 'default',
    theme_mode: 'light',
    radius: '0.5',
    font: 'geist',
  })),
}))

describe('Preferences Store', () => {
  beforeEach(() => {
    // Reset store to initial state
    const store = usePreferencesStore.getState()
    store.hydrate()
  })

  it('should have default values', () => {
    const state = usePreferencesStore.getState()
    expect(state.sidebar_variant).toBeDefined()
    expect(state.theme_preset).toBeDefined()
    expect(state.theme_mode).toBeDefined()
  })

  it('should update sidebar variant', () => {
    const { setSidebarVariant } = usePreferencesStore.getState()
    setSidebarVariant('floating')
    
    const state = usePreferencesStore.getState()
    expect(state.sidebar_variant).toBe('floating')
    expect(state.isSynced).toBe(true)
  })

  it('should update theme preset', () => {
    const { setThemePreset } = usePreferencesStore.getState()
    setThemePreset('brutalist')
    
    const state = usePreferencesStore.getState()
    expect(state.theme_preset).toBe('brutalist')
    expect(state.isSynced).toBe(true)
  })

  it('should update theme mode', () => {
    const { setThemeMode } = usePreferencesStore.getState()
    
    // Mock matchMedia
    global.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    setThemeMode('dark')
    
    const state = usePreferencesStore.getState()
    expect(state.theme_mode).toBe('dark')
    expect(state.resolvedThemeMode).toBe('dark')
    expect(state.isSynced).toBe(true)
  })

  it('should update radius', () => {
    const { setRadius } = usePreferencesStore.getState()
    setRadius('1.0')
    
    const state = usePreferencesStore.getState()
    expect(state.radius).toBe('1.0')
    expect(state.isSynced).toBe(true)
  })

  it('should update font', () => {
    const { setFont } = usePreferencesStore.getState()
    setFont('inter')
    
    const state = usePreferencesStore.getState()
    expect(state.font).toBe('inter')
    expect(state.isSynced).toBe(true)
  })

  it('should hydrate from storage', () => {
    const { hydrate } = usePreferencesStore.getState()
    
    // Mock matchMedia
    global.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    hydrate()
    
    const state = usePreferencesStore.getState()
    expect(state._hydrated).toBe(true)
    expect(state.isSynced).toBe(true)
  })

  it('should resolve system theme mode on hydration', () => {
    const { hydrate } = usePreferencesStore.getState()
    
    // Mock matchMedia to return dark mode
    global.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    hydrate()
    
    const state = usePreferencesStore.getState()
    expect(state.resolvedThemeMode).toBeDefined()
  })
})
