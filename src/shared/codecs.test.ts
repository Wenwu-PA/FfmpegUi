import { describe, expect, it } from 'vitest'
import { codecRegistry, isCodecContainerCompatible, parseEncoderList, recommendedContainer, supportsTargetSize } from './codecs'

describe('codec registry', () => {
  it('has unique ids and a compatible default container for every entry', () => {
    expect(new Set(codecRegistry.map(codec => codec.id)).size).toBe(codecRegistry.length)
    for (const codec of codecRegistry) {
      expect(codec.containers, codec.id).toContain(codec.defaultContainer)
      expect(recommendedContainer(codec.id)).toBe(codec.defaultContainer)
      expect(codec.defaults, codec.id).toBeDefined()
    }
  })

  it('covers the requested video, audio, image, and hardware encoder families', () => {
    const ids = new Set(codecRegistry.map(codec => codec.id))
    for (const id of ['libsvtav1','libaom-av1','librav1e','libvpx-vp9','libvvenc','prores_ks','dnxhd','ffv1','utvideo','huffyuv','libtheora','mjpeg','mpeg4','h263','av1_nvenc','hevc_nvenc','av1_qsv','av1_amf','libopus','flac','alac','wavpack','tta','libvorbis','ac3','eac3','libspeex','avif','webp','jxl','jp2']) expect(ids.has(id), id).toBe(true)
  })

  it('marks target-size support only for codecs with two-pass rate control', () => {
    expect(supportsTargetSize('libvpx-vp9')).toBe(true)
    expect(supportsTargetSize('libaom-av1')).toBe(true)
    expect(supportsTargetSize('ffv1')).toBe(false)
    expect(supportsTargetSize('prores_ks')).toBe(false)
  })
})

describe('codec and container compatibility', () => {
  it.each([
    ['prores_ks','mov',true], ['prores_ks','mp4',false], ['dnxhd','mxf',true], ['dnxhd','mov',true],
    ['ffv1','mkv',true], ['ffv1','avi',false], ['libvpx-vp9','webm',true], ['libsvtav1','mp4',true],
    ['libopus','opus',true], ['libopus','mp4',false], ['libvorbis','ogg',true], ['libvorbis','webm',true],
    ['flac','mkv',true], ['avif','avif',true], ['webp','webp',true], ['jxl','jxl',true], ['jp2','jp2',true],
  ] as const)('%s in .%s => %s', (codec, container, compatible) => {
    expect(isCodecContainerCompatible(codec, container)).toBe(compatible)
  })
})

describe('FFmpeg encoder-list parser', () => {
  it('parses video, audio, and subtitle-capable encoder flags without substring matches', () => {
    const text = [
      'Encoders:',
      ' V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC',
      ' V....D libvpx-vp9           libvpx VP9',
      ' A..... libopus              libopus Opus',
      ' S..... srt                  SubRip subtitle',
      'prefix V..... libx264_fake    not anchored to the encoder column',
      '  libaom-av1 appears only in a description',
    ].join('\n')
    expect(parseEncoderList(text)).toEqual(['libx264','libvpx-vp9','libopus','srt'])
  })
})
