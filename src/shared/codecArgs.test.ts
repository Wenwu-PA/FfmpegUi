import { describe, expect, it } from 'vitest'
import { buildFfmpegArgs, buildTargetSizePassArgs } from './buildFfmpegArgs'
import { codecRegistry } from './codecs'

const newCodecs = codecRegistry.filter(codec => !['libx264','libx265','mpeg4'].includes(codec.id))

describe('codec-specific FFmpeg arguments', () => {
  for (const codec of newCodecs) {
    it(`${codec.id}: builds its default output arguments`, () => {
      const job = { input: 'input.mkv', output: `output.${codec.defaultContainer}`, format: codec.defaultContainer, preset: 'web' as const, quality: 24,
        ...(codec.type === 'video' ? { videoCodec: codec.id } : codec.type === 'audio' ? { audioCodec: codec.id } : { imageCodec: codec.id }) }
      const args = buildFfmpegArgs(job)
      expect(args).toContain(codec.encoder)
      expect(args.at(-1)).toBe(job.output)
      if (codec.type === 'image') expect(args).toContain('-frames:v')
    })

    it(`${codec.id}: applies codec-aware quality and custom parameters`, () => {
      const job = { input: 'source with spaces.mov', output: `encoded.${codec.defaultContainer}`, format: codec.defaultContainer, preset: 'web' as const, quality: 19, qualityMode: 'maximum' as const,
        ...(codec.type === 'video' ? {
          videoCodec: codec.id,
          profile: codec.profiles?.[0],
          pixelFormat: codec.pixelFormats?.at(-1),
          threads: codec.threads ? 6 : undefined,
          rowMt: codec.rowMt,
          cpuUsed: codec.cpuUsed ? 6 : undefined,
          deadline: codec.deadline ? 'best' : undefined,
          filmGrain: codec.filmGrain ? 8 : undefined,
          svtParams: codec.svtParams ? 'film-grain=8' : undefined,
          lossless: codec.losslessOption,
        } : codec.type === 'audio' ? {
          audioCodec: codec.id, audioBitrateKbps: 160, audioQuality: 7, compressionLevel: 7,
        } : { imageCodec: codec.id, imageQuality: 93, imageLossless: true, effort: 8 }) }
      const args = buildFfmpegArgs(job)
      expect(args).toContain(codec.encoder)
      if (codec.type === 'video' && codec.pixelFormats?.length) expect(args).toContain(codec.pixelFormats.at(-1))
      if (codec.type === 'video' && codec.id === 'libvpx-vp9') expect(args).toContain('-row-mt')
      if (codec.type === 'image' && codec.id === 'webp') expect(args).toContain('1')
      if (codec.type === 'audio' && codec.id === 'libvorbis') expect(args).toContain('-q:a')
    })
  }
})

describe('target-size two-pass arguments', () => {
  for (const codec of codecRegistry.filter(item => item.type === 'video' && item.targetSize)) {
    it(`${codec.id}: creates both passes using argv elements`, () => {
      const job = { input: 'in.mkv', output: `out.${codec.defaultContainer}`, format: codec.defaultContainer, preset: 'web' as const, quality: 23, videoCodec: codec.id }
      const first = buildTargetSizePassArgs(job, 1, 'pass log', 1700, 128, 'out')
      const second = buildTargetSizePassArgs(job, 2, 'pass log', 1700, 128, 'out')
      expect(first).toContain('-pass'); expect(first).toContain('1'); expect(first).toContain('-f'); expect(first).toContain('null')
      expect(second).toContain('-pass'); expect(second).toContain('2'); expect(second).toContain('-b:a'); expect(second).toContain('out')
      expect(first.join(' ')).toContain('pass log')
    })
  }

  it('rejects target-size mode for lossless and intraframe codecs', () => {
    expect(() => buildTargetSizePassArgs({ input: 'in.mkv', output: 'out.mkv', format: 'mkv', preset: 'web', quality: 20, videoCodec: 'ffv1' }, 1, 'p', 1000, 128, 'out.mkv')).toThrow(/unsupported/i)
  })
})

describe('audio-only containers', () => {
  it('omits the video stream and selects FLAC for a FLAC output', () => {
    const args = buildFfmpegArgs({ input: 'clip.mp4', output: 'audio.flac', format: 'flac', preset: 'web', quality: 24 })
    expect(args).toContain('-vn')
    expect(args).toContain('-c:a')
    expect(args).toContain('flac')
    expect(args).not.toContain('-c:v')
  })

  it('allows an explicit audio-only mode in a normally audiovisual container', () => {
    const args = buildFfmpegArgs({ input: 'clip.mp4', output: 'audio.mkv', format: 'mkv', preset: 'web', quality: 24, videoCodec: 'none', audioCodec: 'libopus' })
    expect(args).toContain('-vn')
    expect(args).toContain('libopus')
    expect(args).not.toContain('-c:v')
  })

  it('chooses compatible default video and audio codecs for OGG and MXF', () => {
    const ogg = buildFfmpegArgs({ input: 'clip.mp4', output: 'video.ogg', format: 'ogg', preset: 'web', quality: 24 })
    expect(ogg).toContain('libtheora')
    expect(ogg).toContain('libvorbis')
    const mxf = buildFfmpegArgs({ input: 'clip.mp4', output: 'video.mxf', format: 'mxf', preset: 'web', quality: 24 })
    expect(mxf).toContain('dnxhd')
    expect(mxf).toContain('pcm_s16le')
    expect(mxf).not.toContain('-b:a')
  })
})
