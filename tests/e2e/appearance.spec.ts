import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { captureScreenshot } from './captureScreenshot'

test('light theme uses light native controls and follows the system color scheme', async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-studio-appearance-'))
  const app = await electron.launch({ args: ['.', `--user-data-dir=${folder}`], cwd: process.cwd() })
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1280, height: 720 })
    await expect(page.getByRole('heading', { name: 'Конвертер' })).toBeVisible()
    await page.getByRole('button', { name: 'Настройки' }).click()
    const theme = page.getByLabel('Режим темы')
    await theme.selectOption('light')
    const lightState = await page.evaluate(() => ({
      colorScheme: document.documentElement.style.colorScheme,
      page: getComputedStyle(document.body).backgroundColor,
      card: getComputedStyle(document.querySelector('.appearance-settings')!).backgroundColor,
      control: getComputedStyle(document.querySelector('.appearance-settings select')!).backgroundColor,
    }))
    expect(lightState).toEqual({
      colorScheme: 'light',
      page: 'rgb(241, 243, 246)',
      card: 'rgb(255, 255, 255)',
      control: 'rgb(255, 255, 255)',
    })
    await expect.poll(() => page.locator('.user-card').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(248, 250, 252)')
    expect(await page.locator('.profile-avatar').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)')
    await page.evaluate(() => document.fonts.ready)
    await captureScreenshot(page, 'appearance-light-1280x720.webp')

    await page.getByLabel('Готовая палитра').selectOption('sunset')
    expect(await page.locator(':root').evaluate(element => getComputedStyle(element).getPropertyValue('--accent-text-color'))).toMatch(/^#/)
    expect(await page.locator(':root').evaluate(element => getComputedStyle(element).getPropertyValue('--surface-2'))).toBe('#f8fafc')

    await theme.selectOption('system')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe('light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark')
  } finally {
    await app.close()
    rmSync(folder, { recursive: true, force: true })
  }
})
