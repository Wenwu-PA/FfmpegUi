import { _electron as electron, expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('saves a private 256px WebP profile avatar and name across relaunch', async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-studio-profile-'))
  const profile = path.join(folder, 'profile')
  const sourceImage = path.join(folder, 'source.png')
  const generated = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=royalblue:s=360x240', '-frames:v', '1', sourceImage], { encoding: 'utf8' })
  expect(generated.status, generated.stderr).toBe(0)

  let app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: process.cwd() })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'Конвертер' })).toBeVisible()
    await page.getByRole('button', { name: 'Открыть профиль' }).click()
    await page.evaluate(() => window.ffmpegStudio.setProfileName('Studio Tester'))
    await page.getByRole('menuitem', { name: 'Выбрать изображение…' }).click()
    await page.locator('input[type="file"]').setInputFiles(sourceImage)
    await expect(page.locator('.profile-avatar img')).toHaveAttribute('src', /^app-avatar:\/\/profile\/avatar\.webp\?v=/)
    const saved = await page.evaluate(async () => window.ffmpegStudio.getProfile())
    expect(saved.name).toBe('Studio Tester')
    expect(saved.avatarUrl).toMatch(/^app-avatar:\/\/profile\/avatar\.webp\?v=/)
    const loaded = await page.evaluate(url => new Promise<boolean>(resolve => {
      const image = new Image()
      image.onload = () => resolve(true)
      image.onerror = () => resolve(false)
      image.src = url!
    }), saved.avatarUrl)
    expect(loaded).toBe(true)
    await app.close()

    app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: process.cwd() })
    const reopened = await app.firstWindow()
    const restored = await reopened.evaluate(async () => window.ffmpegStudio.getProfile())
    expect(restored.name).toBe('Studio Tester')
    expect(restored.avatarUrl).toMatch(/^app-avatar:\/\/profile\/avatar\.webp\?v=/)
    await reopened.getByRole('button', { name: 'Открыть профиль' }).click()
    await reopened.getByRole('menuitem', { name: 'Сбросить' }).click()
    await expect.poll(() => reopened.evaluate(async () => (await window.ffmpegStudio.getProfile()).name)).not.toBe('Studio Tester')
  } finally {
    await app.close()
    rmSync(folder, { recursive: true, force: true })
  }
})
