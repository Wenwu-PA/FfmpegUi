import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const palettes = ['graphite', 'ocean', 'forest', 'sunset', 'sakura', 'contrast', 'custom']
const themes = ['dark', 'light', 'system']
const densities = ['compact', 'normal', 'spacious']
const backgrounds = ['solid', 'gradient', 'glass', 'image']
const scales = [80, 100, 125, 150]
const viewports = [{ width: 960, height: 600 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]
const screenLabels = ['Converter', 'Merge', 'Queue', 'History', 'Settings']

test('appearance matrix covers theme and palette pairs at layout boundaries', async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-studio-matrix-'))
  const app = await electron.launch({ args: ['.', `--user-data-dir=${folder}`], cwd: process.cwd() })
  try {
    const page = await app.firstWindow()
    const selects = page.locator('.appearance-settings select')
    const collapsed = page.locator('.appearance-settings input[type="checkbox"]').first()
    const scale = page.locator('.appearance-settings input[type="range"]').last()
    let currentLanguage = 'ru'

    for (let index = 0; index < themes.length * palettes.length; index++) {
      const theme = themes[Math.floor(index / palettes.length)]!
      const palette = palettes[index % palettes.length]!
      const language = index % 2 === 0 ? 'ru' : 'en'
      const position = Math.floor(index / 2) % 2 === 0 ? 'left' : 'right'
      const density = densities[index % densities.length]!
      const background = backgrounds[index % backgrounds.length]!
      const value = scales[index % scales.length]!
      const viewport = viewports[index % viewports.length]!
      const screen = screenLabels[index % screenLabels.length]!

      await page.getByRole('button', { name: currentLanguage === 'en' ? 'Settings' : 'Настройки', exact: true }).click()
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: index % 2 === 0 ? 'dark' : 'light' })
      await selects.nth(0).selectOption(theme)
      await selects.nth(1).selectOption(palette)
      if (palette === 'custom') await page.getByLabel('HEX').fill(index % 2 === 0 ? '#ffffff' : '#000000')
      await selects.nth(3).selectOption(background)
      await selects.nth(4).selectOption(density)
      await scale.evaluate((input, next) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        setter.call(input, String(next))
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }, value)
      await selects.nth(7).selectOption(position)
      await collapsed.setChecked(index % 2 === 1)
      await selects.nth(2).selectOption(language)
      currentLanguage = language

      const sectionName = language === 'en' ? screen : ({ Converter: 'Конвертер', Merge: 'Склейка', Queue: 'Очередь', History: 'История', Settings: 'Настройки' } as const)[screen]
      await page.getByRole('button', { name: sectionName, exact: true }).click()
      const geometry = await page.evaluate(() => {
        const content = document.querySelector('.content-scroll')!
        const shell = document.querySelector('.app-shell')!.getBoundingClientRect()
        const visibleContent = content.getBoundingClientRect()
        return {
          viewport: window.innerWidth,
          shellRight: shell.right,
          contentLeft: visibleContent.left,
          contentRight: visibleContent.right,
          content: content.scrollWidth,
          contentClient: content.clientWidth,
        }
      })
      expect(geometry.shellRight, `${theme}/${palette}/${position}/${density}/${value}%/${viewport.width}/${language}/${background}/${screen}`).toBeLessThanOrEqual(geometry.viewport)
      expect(geometry.contentRight, `${theme}/${palette}/${position}/${density}/${value}%/${viewport.width}/${language}/${background}/${screen}`).toBeLessThanOrEqual(geometry.viewport)
      expect(geometry.contentLeft, `${theme}/${palette}/${position}/${density}/${value}%/${viewport.width}/${language}/${background}/${screen}`).toBeGreaterThanOrEqual(0)
      expect(geometry.content, `${theme}/${palette}/${position}/${density}/${value}%/${viewport.width}/${language}/${background}/${screen}`).toBeLessThanOrEqual(geometry.contentClient)
    }
  } finally {
    await app.close()
    rmSync(folder, { recursive: true, force: true })
  }
})
