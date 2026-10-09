import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildFfmpegArgs, buildTargetSizePassArgs } from './buildFfmpegArgs'
import { codecRegistry, parseEncoderList } from './codecs'

const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg'
const ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe'
const listing = spawnSync(ffmpeg, ['-hide_banner','-encoders'], { encoding: 'utf8', timeout: 10_000 })
const installed = new Set(parseEncoderList(`${listing.stdout ?? ''}\n${listing.stderr ?? ''}`))
const gpuChecks = new Map<string, boolean>()
for (const codec of codecRegistry.filter(item => item.hardware && installed.has(item.encoder))) {
  const probe = spawnSync(ffmpeg, ['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x90:rate=1:duration=1','-t','1','-frames:v','1','-an','-c:v',codec.encoder,'-f','null','-'], { encoding: 'utf8', timeout: 5_000 })
  gpuChecks.set(codec.id, probe.status === 0)
}

const directory = mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-codec-smoke-'))
afterAll(() => rmSync(directory, { recursive: true, force: true }))

describe('installed FFmpeg codec smoke encodes', () => {
  for (const codec of codecRegistry) {
    const hasHardware = !codec.hardware || gpuChecks.get(codec.id) === true
    const canRun = installed.has(codec.encoder) && hasHardware && listing.status === 0
    const testCase = canRun ? it : it.skip
    testCase(`${codec.id}: encode one second and probe the output`, () => {
      const output = path.join(directory, `${codec.id}.${codec.defaultContainer}`)
      const input = codec.type === 'audio' ? 'sine=frequency=440:sample_rate=48000:duration=1' : codec.id === 'dnxhd' ? 'testsrc=size=1280x720:rate=24:duration=1' : codec.id === 'h263' ? 'testsrc=size=176x144:rate=24:duration=1' : 'testsrc=size=320x240:rate=24:duration=1'
      const sourceArgs = codec.type === 'audio'
        ? ['-hide_banner','-y','-f','lavfi','-i',input]
        : ['-hide_banner','-y','-f','lavfi','-i',input]
      const args = codec.type === 'video'
          ? buildFfmpegArgs({ input: 'lavfi', output, format: codec.defaultContainer, preset: 'web', quality: 28, qualityMode: 'fast', videoCodec: codec.id, audioCodec: 'copy', profile: codec.profiles?.[0], pixelFormat: codec.pixelFormats?.[0], rowMt: true, cpuUsed: 8 })
        : codec.type === 'audio'
          ? buildFfmpegArgs({ input: 'lavfi', output, format: codec.defaultContainer, preset: 'web', quality: 28, audioCodec: codec.id, audioBitrateKbps: 128 })
          : buildFfmpegArgs({ input: 'lavfi', output, format: codec.defaultContainer, preset: 'web', quality: 28, imageCodec: codec.id, imageQuality: 85 })
      const encoded = spawnSync(ffmpeg, [...sourceArgs,...args.slice(0, -1),output], { encoding: 'utf8', timeout: 30_000 })
      expect(encoded.status, `${codec.id} encode failed: ${encoded.stderr}`).toBe(0)
      const probed = spawnSync(ffprobe, ['-v','error','-show_entries','stream=codec_name','-of','csv=p=0',output], { encoding: 'utf8', timeout: 10_000 })
      expect(probed.status, `${codec.id} ffprobe failed: ${probed.stderr}`).toBe(0)
      expect(probed.stdout.trim()).not.toBe('')
    }, 40_000)
  }
})

describe('installed FFmpeg target-size passes', () => {
  for (const codec of codecRegistry.filter(item => ['libx264','libx265','mpeg4','libvpx-vp9','libaom-av1'].includes(item.id))) {
    const testCase = installed.has(codec.encoder) ? it : it.skip
    testCase(`${codec.id}: completes both target-size passes`, () => {
      const output = path.join(directory, `target-size-${codec.id}.${codec.defaultContainer}`)
      const passlog = path.join(directory, `passlog-${codec.id}`)
      const source = ['-hide_banner','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=24:duration=1']
      const job = { input: 'lavfi', output, format: codec.defaultContainer, preset: 'web' as const, quality: 28, qualityMode: 'fast' as const, videoCodec: codec.id, cpuUsed: 8, rowMt: true }
      const firstArgs = buildTargetSizePassArgs(job, 1, passlog, 450, 96, output)
      const first = spawnSync(ffmpeg, [...source,...firstArgs], { encoding: 'utf8', timeout: 30_000 })
      expect(first.status, `${codec.id} pass one failed: ${first.stderr}`).toBe(0)
      const secondArgs = buildTargetSizePassArgs(job, 2, passlog, 450, 96, output)
      const second = spawnSync(ffmpeg, [...source,...secondArgs], { encoding: 'utf8', timeout: 30_000 })
      expect(second.status, `${codec.id} pass two failed: ${second.stderr}`).toBe(0)
      const probed = spawnSync(ffprobe, ['-v','error','-show_entries','stream=codec_name','-of','csv=p=0',output], { encoding: 'utf8', timeout: 10_000 })
      expect(probed.status).toBe(0)
      expect(probed.stdout.trim()).not.toBe('')
    }, 70_000)
  }
})
