import { _electron as electron, expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildFfmpegArgs } from '../../src/shared/buildFfmpegArgs'

test('starts, probes a generated clip and converts it through the Electron bridge', async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'ffmpeg studio проверка-'))
  const input = path.join(folder, 'исходный файл.mp4')
  const output = path.join(folder, 'готовый файл.mp4')
  const generated = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=25', '-pix_fmt', 'yuv420p', input], { encoding: 'utf8' })
  expect(generated.status, generated.stderr).toBe(0)

  const app = await electron.launch({ args: ['.'], cwd: process.cwd() })
  try {
    const page = await app.firstWindow()
    page.on('console', message => process.stdout.write(`[renderer] ${message.type()}: ${message.text()}\n`))
    page.on('pageerror', error => process.stdout.write(`[renderer-error] ${error.message}\n`))
    await expect(page.getByRole('heading', { name: 'Конвертер' })).toBeVisible()
    await page.screenshot({ path: path.join(process.cwd(), 'docs', 'screenshot.png') })
    const probe = await page.evaluate(file => window.ffmpegStudio.probe(file), input)
    expect(probe.streams.some(stream => stream.codec_type === 'video')).toBe(true)
    const thumbnail = await page.evaluate(file => window.ffmpegStudio.thumbnail(file), input)
    const thumbnailLoaded = await page.evaluate(src => new Promise<boolean>(resolve => {
      const image = new Image()
      image.onload = () => resolve(true)
      image.onerror = () => resolve(false)
      image.src = src
    }), thumbnail)
    expect(thumbnailLoaded).toBe(true)
    const args = buildFfmpegArgs({ input, output, format: 'mp4', preset: 'web', quality: 25 })
    const result = await page.evaluate(({ id, inputPath, outputPath, ffArgs }) => window.ffmpegStudio.convert({ id, input: inputPath, output: outputPath, args: ffArgs.slice(0, -1), duration: 3 }), { id: 'e2e-convert', inputPath: input, outputPath: output, ffArgs: args })
    expect(result.ok).toBe(true)
    const verified = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', output], { encoding: 'utf8' })
    expect(verified.status).toBe(0)
    expect(Number(verified.stdout.trim())).toBeGreaterThan(2.8)
  } finally {
    await app.close()
    rmSync(folder, { recursive: true, force: true })
  }
})
