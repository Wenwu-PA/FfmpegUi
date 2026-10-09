import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('English localization covers every navigation screen and saved preference', async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-studio-language-'))
  const app = await electron.launch({ args: ['.', `--user-data-dir=${folder}`], cwd: process.cwd() })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Настройки' }).click()
    await page.getByLabel('Язык').selectOption('en')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    for (const section of ['Converter', 'Merge', 'Queue', 'History', 'Settings']) {
      await page.getByRole('button', { name: section }).click()
      await expect.poll(() => page.locator('.content-scroll').innerText()).not.toMatch(/[А-Яа-яЁё]/)
    }

    const settings = await page.evaluate(async () => window.ffmpegStudio.getSettings())
    expect(settings.appearance?.language).toBe('en')
    await page.getByLabel('Language').selectOption('ru')
    await expect(page.getByRole('button', { name: 'Конвертер' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  } finally {
    await app.close()
    rmSync(folder, { recursive: true, force: true })
  }
})
