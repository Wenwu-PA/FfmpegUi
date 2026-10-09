import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { captureScreenshot } from './captureScreenshot'

test('collapsed profile and its menu stay centered and inside either edge of the window', async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-studio-sidebar-'))
  const app = await electron.launch({ args: ['.', `--user-data-dir=${folder}`], cwd: process.cwd() })
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1280, height: 720 })
    await expect(page.getByRole('heading', { name: 'Конвертер' })).toBeVisible()
    await page.evaluate(() => window.ffmpegStudio.setProfileName('Alexandra Schwarzenegger Profile'))
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Конвертер' })).toBeVisible()
    await page.evaluate(() => document.querySelector('.app-shell')?.classList.add('sidebar-collapsed'))

    const profileButton = page.getByRole('button', { name: 'Открыть профиль' })
    const profileLabel = page.locator('.user-card > div:nth-child(2)')
    for (const side of ['left', 'right'] as const) {
      await page.evaluate(position => {
        document.querySelector('.app-shell')?.setAttribute('data-sidebar-position', position)
      }, side)
      const navigationButton = page.getByRole('button', { name: 'Конвертер' })
      await navigationButton.hover()
      const navigationTooltip = await navigationButton.evaluate(button => ({
        text: getComputedStyle(button, '::after').content,
        width: Number.parseFloat(getComputedStyle(button, '::after').width),
      }))
      expect(navigationTooltip.text).toContain('Конвертер')
      expect(navigationTooltip.width).toBeGreaterThan(45)
      expect(navigationTooltip.width).toBeLessThanOrEqual(220)
      const alignment = await page.locator('.user-card').evaluate(button => {
        const buttonRect = button.getBoundingClientRect()
        const avatarRect = button.querySelector('.profile-avatar')!.getBoundingClientRect()
        return {
          horizontalDelta: Math.abs(buttonRect.left + buttonRect.width / 2 - avatarRect.left - avatarRect.width / 2),
          verticalDelta: Math.abs(buttonRect.top + buttonRect.height / 2 - avatarRect.top - avatarRect.height / 2),
        }
      })
      expect(alignment.horizontalDelta).toBeLessThan(1)
      expect(alignment.verticalDelta).toBeLessThan(1)
      await expect(profileLabel).toBeHidden()
      await profileButton.hover()
      const tooltip = await profileButton.evaluate(button => getComputedStyle(button, '::after').content)
      expect(tooltip).toContain('Alexandra Schwarzenegger')

      await profileButton.click()
      const menu = page.getByRole('menu')
      await expect(menu).toBeVisible()
      const bounds = await menu.evaluate(element => {
        const { left, top, right, bottom } = element.getBoundingClientRect()
        return { left, top, right, bottom, width: window.innerWidth, height: window.innerHeight }
      })
      expect(bounds.left).toBeGreaterThanOrEqual(0)
      expect(bounds.top).toBeGreaterThanOrEqual(0)
      expect(bounds.right).toBeLessThanOrEqual(bounds.width)
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.height)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await expect(profileButton).toBeFocused()
    }
    await page.evaluate(() => {
      document.querySelector('.app-shell')?.setAttribute('data-sidebar-position', 'left')
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    })
    await page.mouse.move(640, 360)
    await captureScreenshot(page, 'sidebar-collapsed-1280x720.webp')
  } finally {
    await app.close()
    rmSync(folder, { recursive: true, force: true })
  }
})
