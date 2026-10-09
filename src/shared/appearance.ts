import { z } from 'zod'

export const appearanceSchema = z.object({
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
  font: z.enum(['system', 'inter', 'aptos', 'arial']).default('system'),
  monoFont: z.enum(['system', 'consolas', 'cascadia']).default('system'),
  scale: z.number().min(0.8).max(1.5).default(1),
  sidebarPosition: z.enum(['left', 'right']).default('left'),
  sidebarCollapsed: z.boolean().default(false),
  sidebarLabels: z.boolean().default(true),
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

export function readableAccentText(hex: string) {
  const channels = hex.replace('#', '').match(/.{2}/g)?.map(part => parseInt(part, 16) / 255) ?? [0, 0, 0]
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]! > 0.42 ? '#101820' : '#ffffff'
}
