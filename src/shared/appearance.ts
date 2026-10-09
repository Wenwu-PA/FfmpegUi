import { z } from 'zod'

export const appearanceSchema = z.object({
  language: z.enum(['ru', 'en']).default('ru'),
  theme: z.enum(['light', 'dark', 'system']).default('dark'),
  palette: z.enum(['graphite', 'ocean', 'forest', 'sunset', 'sakura', 'contrast', 'custom']).default('graphite'),
  accent: z.string().regex(/^#[\da-f]{6}$/i).default('#a6f15e'),
  colors: z.object({ background: z.string().regex(/^#[\da-f]{6}$/i), surface: z.string().regex(/^#[\da-f]{6}$/i), border: z.string().regex(/^#[\da-f]{6}$/i), text: z.string().regex(/^#[\da-f]{6}$/i), muted: z.string().regex(/^#[\da-f]{6}$/i), success: z.string().regex(/^#[\da-f]{6}$/i), error: z.string().regex(/^#[\da-f]{6}$/i), warning: z.string().regex(/^#[\da-f]{6}$/i) }).default({ background: '#0b0d12', surface: '#12151c', border: '#252b35', text: '#e8eaf1', muted: '#858b99', success: '#87d869', error: '#ef746d', warning: '#e2b750' }),
  background: z.enum(['solid', 'gradient', 'glass', 'image', 'mica', 'acrylic']).default('gradient'),
  backgroundImage: z.string().max(7_000_000).optional(),
  glassOpacity: z.number().int().min(20).max(100).default(82),
  glassBlur: z.number().int().min(0).max(32).default(12),
  radius: z.number().int().min(0).max(24).default(10),
  density: z.enum(['compact', 'normal', 'spacious']).default('normal'),
  borderWidth: z.number().min(0).max(2).default(1),
  shadowStrength: z.number().int().min(0).max(100).default(35),
  font: z.enum(['system', 'inter', 'aptos', 'arial']).default('inter'),
  monoFont: z.enum(['system', 'consolas', 'cascadia']).default('system'),
  scale: z.number().min(0.8).max(1.5).default(1),
  sidebarPosition: z.enum(['left', 'right']).default('left'),
  sidebarCollapsed: z.boolean().default(false),
  sidebarLabels: z.boolean().default(true),
  showProfile: z.boolean().default(true),
  sidebarSections: z.array(z.enum(['converter', 'merge', 'queue', 'history', 'settings'])).default(['converter', 'merge', 'queue', 'history', 'settings']),
  hiddenSections: z.array(z.enum(['converter', 'merge', 'queue', 'history', 'settings'])).default([]),
  animations: z.boolean().default(true),
  animationSpeed: z.enum(['slow', 'normal', 'fast']).default('normal'),
  alwaysOnTop: z.boolean().default(false),
  minimizeToTray: z.boolean().default(false),
  startMinimized: z.boolean().default(false),
  rememberWindow: z.boolean().default(true),
  nativeTitlebar: z.boolean().default(true),
  hotkeys: z.object({ convert: z.string().min(1).max(32).default('Ctrl+Enter'), open: z.string().min(1).max(32).default('Ctrl+O'), settings: z.string().min(1).max(32).default('Ctrl+,') }).default({ convert: 'Ctrl+Enter', open: 'Ctrl+O', settings: 'Ctrl+,' }),
})

export type Appearance = z.infer<typeof appearanceSchema>
export const defaultAppearance = appearanceSchema.parse({})

export const palettes: Record<Appearance['palette'], Pick<Appearance, 'colors' | 'accent'>> = {
  graphite: { colors: { background: '#0b0d12', surface: '#12151c', border: '#252b35', text: '#e8eaf1', muted: '#858b99', success: '#87d869', error: '#ef746d', warning: '#e2b750' }, accent: '#a6f15e' },
  ocean: { colors: { background: '#07131b', surface: '#0e202b', border: '#214150', text: '#e0f5fa', muted: '#82a7b2', success: '#68d6bb', error: '#ff827c', warning: '#f0c66e' }, accent: '#53d7e8' },
  forest: { colors: { background: '#0b1511', surface: '#122019', border: '#2d4938', text: '#e3f2e8', muted: '#8ca796', success: '#94d66c', error: '#ef8175', warning: '#d9bd68' }, accent: '#9bdb68' },
  sunset: { colors: { background: '#19100f', surface: '#251717', border: '#56362f', text: '#ffede4', muted: '#b9968a', success: '#9bd079', error: '#ff8170', warning: '#f5bd67' }, accent: '#ff9b70' },
  sakura: { colors: { background: '#19121a', surface: '#251b27', border: '#4b3448', text: '#fff0fa', muted: '#b99cb2', success: '#9bd68b', error: '#ff829e', warning: '#ecc46d' }, accent: '#f293c5' },
  contrast: { colors: { background: '#000000', surface: '#101010', border: '#777777', text: '#ffffff', muted: '#d0d0d0', success: '#00ff87', error: '#ff6868', warning: '#ffdf00' }, accent: '#ffff00' },
  custom: { colors: defaultAppearance.colors, accent: defaultAppearance.accent },
}

export const paletteNames: Record<Exclude<Appearance['palette'], 'custom'>, string> = { graphite: 'Графит', ocean: 'Океан', forest: 'Лес', sunset: 'Закат', sakura: 'Сакура', contrast: 'Контраст' }

export const requiredAppearanceColorTokens = [
  '--bg', '--surface', '--surface-2', '--surface-3', '--surface-4', '--surface-raised', '--card-surface', '--inset-surface', '--sidebar-surface',
  '--control-surface', '--control-border', '--control-text', '--button-border', '--button-text', '--icon-muted',
  '--border', '--border-subtle', '--border-strong', '--text', '--text-strong', '--text-secondary', '--text-muted',
  '--text-subtle', '--text-inverse', '--accent', '--accent-contrast', '--accent-text-color', '--accent-soft',
  '--accent-hover', '--accent-border', '--success', '--success-soft', '--danger', '--danger-soft', '--danger-border',
  '--warning', '--warning-soft', '--warning-border', '--focus-ring', '--overlay', '--overlay-strong', '--shadow-sm',
  '--shadow-md', '--shadow-lg', '--shadow-soft', '--card-shadow', '--app-background-gradient', '--dropzone-gradient',
  '--selected-gradient', '--image-overlay',
] as const

function hexChannels(hex: string) {
  const parts = hex.replace('#', '').match(/.{2}/g)
  return parts?.map(part => parseInt(part, 16) / 255) ?? [0, 0, 0]
}

function mixHexColors(first: string, second: string, firstWeight: number) {
  const firstChannels = hexChannels(first)
  const secondChannels = hexChannels(second)
  return `#${firstChannels.map((channel, index) => Math.round((channel * firstWeight + secondChannels[index]! * (1 - firstWeight)) * 255).toString(16).padStart(2, '0')).join('')}`
}

export function relativeLuminance(hex: string) {
  const [red, green, blue] = hexChannels(hex).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
}

export function contrastRatio(foreground: string, background: string) {
  const first = relativeLuminance(foreground)
  const second = relativeLuminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

export function ensureContrast(foreground: string, background: string, minimum = 4.5) {
  if (contrastRatio(foreground, background) >= minimum) return foreground.toLowerCase()
  const dark = '#101820'
  const light = '#ffffff'
  const target = contrastRatio(dark, background) >= contrastRatio(light, background) ? dark : light
  const start = hexChannels(foreground)
  const end = hexChannels(target)
  for (let step = 1; step <= 100; step++) {
    const fraction = step / 100
    const candidate = `#${start.map((channel, index) => Math.round((channel + (end[index]! - channel) * fraction) * 255).toString(16).padStart(2, '0')).join('')}`
    if (contrastRatio(candidate, background) >= minimum) return candidate
  }
  return target
}

export function appearanceColorTokens(value: Appearance, dark: boolean) {
  const palette = palettes[value.palette]
  const source = value.palette === 'custom' ? value.colors : palette.colors
  const colors = dark
    ? source
    : { ...source, background: '#f1f3f6', surface: '#ffffff', border: '#cbd3de', text: '#202632', muted: '#4f5d6e' }
  const graphite = dark && value.palette === 'graphite'
  const surface2 = dark
    ? graphite ? '#171b23' : mixHexColors(colors.surface, colors.text, 0.88)
    : '#f8fafc'
  const surface3 = dark
    ? graphite ? '#202631' : mixHexColors(colors.surface, colors.text, 0.78)
    : '#f1f3f6'
  const surface4 = dark
    ? graphite ? '#272e3a' : mixHexColors(colors.surface, colors.text, 0.68)
    : '#e8edf3'
  const accessibleAccent = dark ? value.accent : ensureContrast(value.accent, colors.background)
  const success = dark ? colors.success : ensureContrast(colors.success, colors.background)
  const danger = dark ? colors.error : ensureContrast(colors.error, colors.background)
  const warning = dark ? colors.warning : ensureContrast(colors.warning, colors.background)
  const muted = dark ? ensureContrast(colors.muted, surface2) : colors.muted
  const backgroundDim = 0.8 - value.glassOpacity / 100 * 0.65
  const imageOverlay = `color-mix(in srgb, ${colors.background} ${Math.round(backgroundDim * 100)}%, transparent)`
  const darkShadow = '#000000'
  const lightShadow = '#64748b'
  const shadowColor = dark ? darkShadow : lightShadow
  const shadowScale = value.shadowStrength / 35
  const shadow = (x: number, y: number, blur: number, strength: number) => `${x}px ${y}px ${blur}px color-mix(in srgb, ${shadowColor} ${Math.round(strength * shadowScale)}%, transparent)`
  const defaultDarkGradient = 'radial-gradient(ellipse at 74% -30%, #172019, transparent 42%), var(--bg)'
  const accentGradient = 'radial-gradient(ellipse at 74% -30%, color-mix(in srgb, var(--success) 12%, transparent), transparent 42%), var(--bg)'
  return {
    '--bg': colors.background,
    '--surface': colors.surface,
    '--surface-2': surface2,
    '--surface-3': surface3,
    '--surface-4': surface4,
    '--surface-raised': dark && graphite ? '#10131a' : colors.surface,
    '--card-surface': dark ? colors.background : colors.surface,
    '--inset-surface': dark ? colors.background : surface2,
    '--sidebar-surface': dark ? graphite ? '#0e1016' : colors.surface : '#f8fafc',
    '--control-surface': dark && graphite ? '#171b23' : colors.surface,
    '--control-border': dark ? graphite ? '#303744' : colors.border : '#718096',
    '--control-text': dark && graphite ? '#d1d5de' : colors.text,
    '--button-border': dark ? graphite ? '#343b47' : colors.border : '#718096',
    '--button-text': dark && graphite ? '#cdd1d9' : colors.text,
    '--icon-muted': dark && graphite ? '#858c99' : colors.muted,
    '--panel': colors.surface,
    '--line': colors.border,
    '--muted': muted,
    '--border': colors.border,
    '--border-strong': dark ? graphite ? '#414a58' : `color-mix(in srgb, ${colors.border} 72%, ${colors.text})` : '#718096',
    '--border-subtle': dark ? graphite ? '#ffffff0a' : `color-mix(in srgb, ${colors.border} 45%, transparent)` : `color-mix(in srgb, ${colors.border} 72%, transparent)`,
    '--text': colors.text,
    '--text-strong': colors.text,
    '--text-secondary': dark ? graphite ? '#d8dbe4' : colors.text : '#364152',
    '--text-muted': muted,
    '--text-subtle': ensureContrast(dark && graphite ? '#666d79' : colors.muted, dark ? surface2 : colors.background),
    '--text-inverse': '#ffffff',
    '--accent': value.accent,
    '--accent-contrast': readableAccentText(value.accent),
    '--accent-text': readableAccentText(value.accent),
    '--accent-text-color': accessibleAccent,
    '--accent-soft': `color-mix(in srgb, ${value.accent} ${dark ? 8 : 12}%, transparent)`,
    '--accent-hover': `color-mix(in srgb, ${value.accent} 82%, var(--text-inverse))`,
    '--accent-border': dark ? `color-mix(in srgb, ${value.accent} 24%, ${colors.border})` : `color-mix(in srgb, ${accessibleAccent} 48%, ${colors.border})`,
    '--success': success,
    '--success-soft': `color-mix(in srgb, ${colors.success} 10%, transparent)`,
    '--danger': danger,
    '--danger-soft': `color-mix(in srgb, ${colors.error} 10%, transparent)`,
    '--danger-border': `color-mix(in srgb, ${danger} ${dark ? 42 : 48}%, ${colors.border})`,
    '--warning': warning,
    '--warning-soft': `color-mix(in srgb, ${colors.warning} 10%, transparent)`,
    '--warning-border': `color-mix(in srgb, ${warning} ${dark ? 42 : 48}%, ${colors.border})`,
    '--focus-ring': dark ? value.accent : accessibleAccent,
    '--overlay': dark ? '#080a0edb' : '#10182080',
    '--overlay-strong': dark ? '#000b' : '#101820a6',
    '--shadow-sm': shadow(0, 5, 18, dark ? 20 : 12),
    '--shadow-md': shadow(0, 10, 32, dark ? 53 : 16),
    '--shadow-lg': shadow(0, 18, 48, dark ? 67 : 20),
    '--shadow-soft': shadow(0, 5, 18, dark ? 9 : 10),
    '--card-shadow': dark ? 'none' : shadow(0, 1, 3, 12),
    '--app-background-gradient': value.background === 'gradient' && dark ? graphite ? defaultDarkGradient : accentGradient : 'none',
    '--dropzone-gradient': dark && graphite
      ? 'linear-gradient(105deg, #151920a8, #12151bb3)'
      : dark
      ? `linear-gradient(105deg, color-mix(in srgb, ${colors.surface} 72%, transparent), color-mix(in srgb, ${colors.surface} 84%, transparent))`
      : `linear-gradient(105deg, ${colors.surface}, color-mix(in srgb, ${colors.background} 55%, ${colors.surface}))`,
    '--selected-gradient': dark && graphite
      ? 'linear-gradient(100deg, #9edb5710, #12171b)'
      : dark
      ? `linear-gradient(100deg, color-mix(in srgb, ${value.accent} 7%, transparent), ${colors.background})`
      : `linear-gradient(100deg, color-mix(in srgb, ${value.accent} 7%, ${colors.surface}), ${colors.surface})`,
    '--image-overlay': `linear-gradient(${imageOverlay}, ${imageOverlay})`,
  }
}

export function readableAccentText(hex: string) {
  if (hex.toLowerCase() === '#a6f15e') return '#182112'
  return contrastRatio('#101820', hex) >= contrastRatio('#ffffff', hex) ? '#101820' : '#ffffff'
}
