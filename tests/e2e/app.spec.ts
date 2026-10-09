import { _electron as electron, expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildFfmpegArgs } from '../../src/shared/buildFfmpegArgs'
import { calculateTargetVideoBitrateKbps } from '../../src/shared/targetSize'
import { captureScreenshot } from './captureScreenshot'

test('starts, probes a generated clip and converts it through the Electron bridge', async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'ffmpeg studio проверка-'))
  const input = path.join(folder, 'исходный файл.mp4')
  const secondInput = path.join(folder, 'второй файл.mp4')
  const output = path.join(folder, 'готовый файл.mp4')
  const merged = path.join(folder, 'склеенный файл.mp4')
  const generated = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=25', '-pix_fmt', 'yuv420p', input], { encoding: 'utf8' })
  expect(generated.status, generated.stderr).toBe(0)
  const generatedSecond = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=duration=2:size=320x240:rate=25', '-pix_fmt', 'yuv420p', secondInput], { encoding: 'utf8' })
  expect(generatedSecond.status, generatedSecond.stderr).toBe(0)

  const app = await electron.launch({ args: ['.', `--user-data-dir=${folder}`], cwd: process.cwd() })
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.evaluate(() => window.ffmpegStudio.setProfileName('Alex'))
    await page.reload()
    page.on('console', message => process.stdout.write(`[renderer] ${message.type()}: ${message.text()}\n`))
    page.on('pageerror', error => process.stdout.write(`[renderer-error] ${error.message}\n`))
    await expect(page.getByRole('heading', { name: 'Конвертер' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await captureScreenshot(page, 'converter-1280x720.webp')
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
    const mergeResult = await page.evaluate(({ id, inputs, outputPath }) => window.ffmpegStudio.merge({ id, inputs, output: outputPath }), { id: 'e2e-merge', inputs: [input, secondInput], outputPath: merged })
    expect(mergeResult.ok).toBe(true)
    const mergedDuration = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', merged], { encoding: 'utf8' })
    expect(Number(mergedDuration.stdout.trim())).toBeGreaterThan(4.8)
    const trimmed = path.join(folder, 'фрагмент.webm')
    const webmArgs = buildFfmpegArgs({ input, output: trimmed, format: 'webm', preset: 'web', quality: 30, start: 1, duration: 1 })
    const trimResult = await page.evaluate(({ id, inputPath, outputPath, ffArgs }) => window.ffmpegStudio.convert({ id, input: inputPath, output: outputPath, args: ffArgs.slice(0, -1), duration: 1 }), { id: 'e2e-trim', inputPath: input, outputPath: trimmed, ffArgs: webmArgs })
    expect(trimResult.ok).toBe(true)
    const trimmedDuration = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', trimmed], { encoding: 'utf8' })
    expect(Number(trimmedDuration.stdout.trim())).toBeGreaterThan(0.8)
    expect(Number(trimmedDuration.stdout.trim())).toBeLessThan(1.3)
    const compressed = path.join(folder, 'сжатый.mp4')
    const audioKbps = 128
    const videoKbps = calculateTargetVideoBitrateKbps(1, 3, audioKbps)
    const compressResult = await page.evaluate(({ id, inputPath, outputPath, bitrate }) => window.ffmpegStudio.compress({ id, input: inputPath, output: outputPath, videoKbps: bitrate, audioKbps: 128, duration: 3 }), { id: 'e2e-compress', inputPath: input, outputPath: compressed, bitrate: videoKbps })
    expect(compressResult.ok).toBe(true)
    expect(statSync(compressed).size).toBeLessThan(1_000_000)
    expect(readdirSync(folder).some(file => file.includes('.part.'))).toBe(false)
  } finally {
    await app.close()
    rmSync(folder, { recursive: true, force: true })
  }
})
