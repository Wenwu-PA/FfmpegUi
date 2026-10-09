import { describe, expect, it } from 'vitest'
import { appearanceSchema, defaultAppearance, palettes, readableAccentText } from './appearance'

describe('appearance preferences', () => {
  it('provides valid defaults for every supported setting', () => {
    expect(appearanceSchema.parse({})).toEqual(defaultAppearance)
    expect(Object.keys(palettes)).toHaveLength(7)
    expect(defaultAppearance).toMatchObject({ theme: 'dark', palette: 'graphite', background: 'gradient', font: 'inter', density: 'normal', radius: 10, borderWidth: 1, scale: 1 })
  })

  it('rejects unsafe values outside the supported ranges', () => {
    expect(appearanceSchema.safeParse({ scale: 2 }).success).toBe(false)
    expect(appearanceSchema.safeParse({ accent: 'red' }).success).toBe(false)
    expect(appearanceSchema.safeParse({ sidebarSections: ['unknown'] }).success).toBe(false)
  })

  it('chooses a contrasting label color for light and dark accents', () => {
    expect(readableAccentText('#ffffff')).toBe('#101820')
    expect(readableAccentText('#000000')).toBe('#ffffff')
  })
})
