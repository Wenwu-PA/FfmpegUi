import { describe, expect, it } from 'vitest'
import { appearanceColorTokens, appearanceSchema, contrastRatio, defaultAppearance, ensureContrast, palettes, readableAccentText, requiredAppearanceColorTokens } from './appearance'

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
    for (const accent of ['#ffffff', '#000000', '#ffff00', '#a6f15e', '#ff9b70']) {
      expect(contrastRatio(readableAccentText(accent), accent)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('provides a complete readable token set for every palette in both color schemes', () => {
    const foregrounds = ['--text', '--text-strong', '--text-secondary', '--text-muted', '--text-subtle', '--control-text', '--button-text', '--accent-text-color', '--success', '--danger', '--warning'] as const
    const surfaces = ['--bg', '--surface', '--surface-2', '--card-surface', '--control-surface'] as const
    for (const palette of Object.keys(palettes) as (keyof typeof palettes)[]) {
      for (const dark of [true, false]) {
        const value = appearanceSchema.parse({ ...defaultAppearance, palette, theme: dark ? 'dark' : 'light', accent: palettes[palette].accent, colors: palettes[palette].colors })
        const tokens = appearanceColorTokens(value, dark)
        for (const name of requiredAppearanceColorTokens) expect(tokens[name], `${palette} ${dark ? 'dark' : 'light'} ${name}`).toBeTruthy()
        for (const foreground of foregrounds) {
          for (const surface of surfaces) {
            expect(contrastRatio(tokens[foreground], tokens[surface]), `${palette} ${dark ? 'dark' : 'light'} ${foreground} on ${surface}`).toBeGreaterThanOrEqual(4.5)
          }
        }
        expect(contrastRatio(tokens['--accent-contrast'], tokens['--accent']), `${palette} ${dark ? 'dark' : 'light'} accent label`).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(tokens['--focus-ring'], tokens['--surface']), `${palette} ${dark ? 'dark' : 'light'} focus ring`).toBeGreaterThanOrEqual(3)
        if (!dark) expect(contrastRatio(tokens['--control-border'], tokens['--control-surface']), `${palette} light control border`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('keeps custom accents readable against light surfaces', () => {
    for (const accent of ['#ffffff', '#000000', '#ffff00', '#f293c5']) {
      const value = appearanceSchema.parse({ ...defaultAppearance, theme: 'light', palette: 'custom', accent })
      const tokens = appearanceColorTokens(value, false)
      expect(contrastRatio(tokens['--accent-text-color'], tokens['--surface'])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(tokens['--accent-contrast'], accent)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(ensureContrast(accent, '#ffffff'), '#ffffff')).toBeGreaterThanOrEqual(4.5)
    }
  })
})
