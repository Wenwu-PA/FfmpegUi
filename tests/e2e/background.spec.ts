import { _electron as electron, expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('stores a resized background image and restores it after relaunch', async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-studio-background-'))
  const profile = path.join(folder, 'profile')
  const sourceImage = path.join(folder, 'source.png')
  const generated = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=tomato:s=320x180', '-frames:v', '1', sourceImage], { encoding: 'utf8' })
  expect(generated.status, generated.stderr).toBe(0)

  let app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: process.cwd() })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Настройки' }).click()
    await page.getByLabel('Фон приложения').selectOption('image')
    await app.evaluate(({ dialog }, image) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [image] })
    }, sourceImage)
    await page.getByRole('button', { name: 'Выбрать изображение' }).click()
    await expect(page.getByAltText('Предпросмотр фона')).toBeVisible()
    const saved = await page.evaluate(async () => window.ffmpegStudio.getSettings())
    expect(saved.appearance?.backgroundImage).toMatch(/^app-bg:\/\/background\/[\da-f-]{36}\.jpg\?v=\d+$/i)
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-bg-image'))).toContain('app-bg://background/')
    const loaded = await page.evaluate(url => new Promise<boolean>(resolve => {
      const image = new Image()
      image.onload = () => resolve(true)
      image.onerror = () => resolve(false)
      image.src = url
    }), saved.appearance!.backgroundImage!)
    expect(loaded).toBe(true)
    unlinkSync(sourceImage)
    await app.close()

    app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: process.cwd() })
    const reopened = await app.firstWindow()
    const restored = await reopened.evaluate(async () => window.ffmpegStudio.getSettings())
    expect(restored.appearance?.background).toBe('image')
    expect(restored.appearance?.backgroundImage).toBe(saved.appearance?.backgroundImage)
    expect(restored.backgroundWarning).toBeUndefined()
    await reopened.getByRole('button', { name: 'Настройки' }).click()
    await expect(reopened.getByAltText('Предпросмотр фона')).toBeVisible()
    await reopened.evaluate(async () => {
      const settings = await window.ffmpegStudio.getSettings()
      await window.ffmpegStudio.setSettings({ appearance: { ...settings.appearance!, backgroundImage: 'app-bg://background/00000000-0000-0000-0000-000000000000.jpg?v=1' } })
    })
    await app.close()
    app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: process.cwd() })
    const recovered = await app.firstWindow().then(window => window.evaluate(async () => window.ffmpegStudio.getSettings()))
    expect(recovered.appearance?.background).toBe('gradient')
    expect(recovered.backgroundWarning).toContain('недоступна')
  } finally {
    await app.close()
    rmSync(folder, { recursive: true, force: true })
  }
})
