import { codecById, defaultAudioCodecForContainer, defaultVideoCodecForContainer, type CodecDefinition, type QualityMode } from './codecs'
import type { JobConfig } from './types'

const presetValue = (codec: string, mode: QualityMode | undefined) => {
  if (codec === 'libvvenc') return ({ fast: '4', balanced: '3', maximum: '1', lossless: '0' } as const)[mode ?? 'balanced']
  if (codec === 'libsvtav1') return ({ fast: '10', balanced: '7', maximum: '4', lossless: '4' } as const)[mode ?? 'balanced']
  if (codec === 'libaom-av1') return ({ fast: '8', balanced: '6', maximum: '2', lossless: '2' } as const)[mode ?? 'balanced']
  if (codec === 'librav1e') return ({ fast: '8', balanced: '6', maximum: '3', lossless: '3' } as const)[mode ?? 'balanced']
  if (codec === 'libvpx-vp9') return ({ fast: '6', balanced: '4', maximum: '1', lossless: '1' } as const)[mode ?? 'balanced']
  if (codec.includes('_nvenc')) return ({ fast: 'p1', balanced: 'p4', maximum: 'p7', lossless: 'p7' } as const)[mode ?? 'balanced']
  if (codec.includes('_qsv')) return ({ fast: 'veryfast', balanced: 'medium', maximum: 'veryslow', lossless: 'veryslow' } as const)[mode ?? 'balanced']
  if (codec.includes('_amf')) return ({ fast: 'speed', balanced: 'balanced', maximum: 'quality', lossless: 'quality' } as const)[mode ?? 'balanced']
  return ({ fast: 'fast', balanced: 'medium', maximum: 'slow', lossless: 'slow' } as const)[mode ?? 'balanced']
}

function selectedPixelFormat(job: JobConfig, codec: CodecDefinition) {
  if (job.pixelFormat && codec.pixelFormats?.includes(job.pixelFormat)) return job.pixelFormat
  if (job.bitDepth && codec.bitDepths?.includes(job.bitDepth)) {
    const preferred = codec.pixelFormats?.find(format => format.includes(`${job.bitDepth}le`))
    if (preferred) return preferred
  }
  return codec.defaults.pixelFormat && codec.pixelFormats?.includes(codec.defaults.pixelFormat) ? codec.defaults.pixelFormat : codec.pixelFormats?.[0]
}

function addVideoCodecArgs(args: string[], job: JobConfig, codec: CodecDefinition, targetBitrate?: number) {
  const id = codec.id
  const qualityMode = job.qualityMode ?? codec.defaults.qualityMode
  const lossless = job.lossless || qualityMode === 'lossless'
  const vp9Lossless = id === 'libvpx-vp9' && lossless
  args.push('-c:v', codec.encoder)
  if (codec.rateControl === 'none') {
    // Intraframe and lossless encoders have no meaningful CRF or target-size mode.
  } else if (vp9Lossless) {
    // libvpx enables its lossless mode with -lossless and zero bitrate mode below.
  } else if (targetBitrate) {
    args.push('-b:v', `${targetBitrate}k`)
  } else if (id === 'mpeg4') {
    args.push('-q:v', String(Math.max(2, Math.min(31, Math.round(job.quality / 4)))))
  } else if (id === 'mjpeg') {
    args.push('-q:v', String(Math.max(2, Math.min(31, Math.round(2 + job.quality / 2)))))
  } else if (id === 'h263') {
    args.push('-b:v', `${targetBitrate ?? 1000}k`)
  } else if (codec.rateControl === 'qp') {
    if (id.endsWith('_qsv')) args.push('-global_quality', String(job.quality))
    else if (id.endsWith('_amf')) args.push('-qp_i', String(job.quality), '-qp_p', String(job.quality))
    else args.push('-qp', String(job.quality))
  } else if (codec.rateControl === 'quality') {
    args.push('-q:v', String(Math.max(2, Math.min(31, Math.round(2 + job.quality / 2)))))
  } else {
    args.push('-crf', String(job.quality))
  }

  if (id === 'libaom-av1') args.push('-cpu-used', String(job.cpuUsed ?? presetValue(id, qualityMode)))
  else if (id === 'librav1e') args.push('-speed', presetValue(id, qualityMode))
  else if (codec.presets && id !== 'libvpx-vp9') args.push('-preset', presetValue(id, qualityMode))
  const selectedProfile = job.profile ?? codec.defaults.profile
  if (selectedProfile && codec.profiles?.includes(selectedProfile)) {
    if (id === 'prores_ks') {
      const profile = ({ proxy: '0', lt: '1', '422': '2', hq: '3', '4444': '4' } as Record<string,string>)[selectedProfile]
      if (profile) args.push('-profile:v', profile)
    } else if (id === 'dnxhd') {
      const profile = ({ lb: 'dnxhr_lb', sq: 'dnxhr_sq', hq: 'dnxhr_hq', hqx: 'dnxhr_hqx', '444': 'dnxhr_444' } as Record<string,string>)[selectedProfile]
      if (profile) args.push('-profile:v', profile)
    } else args.push('-profile:v', selectedProfile)
  }
  const pixelFormat = selectedPixelFormat(job, codec)
  if (pixelFormat) args.push('-pix_fmt', pixelFormat)
  if (job.threads && codec.threads) args.push('-threads', String(Math.max(1, Math.min(128, Math.round(job.threads)))))
  if (job.tune && codec.tune) args.push('-tune', job.tune)
  if (id === 'libvpx-vp9') {
    args.push('-deadline', job.deadline ?? 'good', '-cpu-used', String(job.cpuUsed ?? presetValue(id, qualityMode)))
    if (job.rowMt !== false) args.push('-row-mt', '1')
    if (lossless) args.push('-lossless', '1')
    else if (!targetBitrate) args.push('-b:v', '0')
  } else {
    if (job.rowMt && codec.rowMt) args.push('-row-mt', '1')
    if (job.filmGrain !== undefined && job.filmGrain > 0 && codec.filmGrain && id === 'libsvtav1') {
      args.push('-svtav1-params', `film-grain=${Math.max(0, Math.min(50, Math.round(job.filmGrain)))}`)
    } else if (job.svtParams && codec.svtParams && /^[a-z0-9_-]+=[a-z0-9_.,=-]+(?:,[a-z0-9_-]+=[a-z0-9_.,=-]+)*$/i.test(job.svtParams)) {
      args.push('-svtav1-params', job.svtParams)
    }
  }
  if (lossless && codec.losslessOption && id !== 'libvpx-vp9') args.push('-lossless', '1')
  if (id === 'ffv1') args.push('-level', '3', '-coder', '1', '-context', '1')
  if (job.preset === 'telegram') args.push('-maxrate', '4M', '-bufsize', '8M')
}

function addAudioCodecArgs(args: string[], job: JobConfig, targetBitrate?: number) {
  const codec = job.audioCodec ?? defaultAudioCodecForContainer(job.format)
  args.push('-c:a', codec)
  const defaults = codecById(codec)?.defaults
  const bitrate = targetBitrate ?? job.audioBitrateKbps ?? defaults?.audioBitrateKbps ?? 192
  if (codec === 'flac') args.push('-compression_level', String(job.compressionLevel ?? defaults?.compressionLevel ?? 5))
  else if (codec === 'libvorbis') args.push('-q:a', String(job.audioQuality ?? defaults?.audioQuality ?? 5))
  else if (codec === 'wavpack') args.push('-compression_level', String(job.compressionLevel ?? defaults?.compressionLevel ?? 3))
  else if (codec === 'tta' || codec === 'alac' || codec === 'pcm_s16le') { /* lossless codecs do not accept bitrate controls */ }
  else if (codec === 'libspeex') args.push('-abr', '1', '-b:a', `${bitrate}k`)
  else args.push('-b:a', `${bitrate}k`)
  return codec
}

function addImageArgs(args: string[], job: JobConfig, codec: CodecDefinition) {
  args.push('-frames:v', '1', '-c:v', codec.encoder)
  const quality = job.imageQuality ?? codec.defaults.imageQuality ?? job.quality
  if (codec.id === 'webp') {
    args.push('-lossless', job.imageLossless ? '1' : '0', '-quality', String(Math.max(0, Math.min(100, quality))))
  } else if (codec.id === 'jxl') {
    args.push('-distance', job.imageLossless ? '0' : String(Math.max(0.1, Math.min(15, (100 - quality) / 6))), '-effort', String(job.effort ?? codec.defaults.effort ?? 7))
  } else if (codec.id === 'avif') {
    const effort = job.effort ?? codec.defaults.effort ?? 7
    args.push('-still-picture', '1', '-crf', String(job.imageLossless ? 0 : Math.max(0, Math.min(63, Math.round((100 - quality) * 0.63)))), '-cpu-used', String(9 - effort))
  } else if (codec.id === 'jp2') {
    args.push('-format', 'jp2', '-irreversible', job.imageLossless ? '0' : '1')
    if (!job.imageLossless) args.push('-fixed_quality', String(Math.max(0.01, Math.min(1, quality / 100))))
  }
}

/** Creates deterministic FFmpeg arguments from a validated conversion configuration. */
export function buildFfmpegArgs(job: JobConfig): string[] {
  const args: string[] = []
  if (job.start !== undefined && job.start > 0) args.push('-ss', String(job.start))
  if (job.duration !== undefined && job.duration > 0) args.push('-t', String(job.duration))
  if (job.preset === 'mp3') return [...args, '-vn', '-c:a', job.audioCodec ?? 'libmp3lame', '-b:a', `${job.audioBitrateKbps ?? 192}k`, job.output]
  if (job.preset === 'gif' || job.format === 'gif') return [...args, '-vf', 'fps=15,scale=640:-1:flags=lanczos', '-loop', '0', job.output]

  const imageCodec = codecById(job.imageCodec ?? job.format)
  if (imageCodec?.type === 'image') {
    addImageArgs(args, job, imageCodec)
    return [...args, job.output]
  }

  const codecId = job.videoCodec ?? defaultVideoCodecForContainer(job.format, job.preset === 'h265')
  const audioOnlyOutput = ['opus','flac','m4a','wv','tta','ac3','eac3','spx','wav'].includes(job.format) || codecId === 'none'
  if (audioOnlyOutput) {
    args.push('-vn')
    addAudioCodecArgs(args, job)
    if (['m4a'].includes(job.format)) args.push('-movflags', '+faststart')
    return [...args, job.output]
  }
  if (job.videoCodec === 'copy') {
    args.push('-c:v','copy','-c:a',job.audioCodec ?? 'copy')
    return [...args, job.output]
  }
  const codec = codecById(codecId)
  if (!codec || codec.type !== 'video') throw new Error(`Unsupported video codec: ${codecId}`)
  if (codecId === 'copy') args.push('-c:v', 'copy')
  else addVideoCodecArgs(args, job, codec)
  const audioCodec = job.audioCodec ?? defaultAudioCodecForContainer(job.format)
  if (audioCodec !== 'copy') addAudioCodecArgs(args, job)
  else args.push('-c:a', 'copy')
  if (['mp4', 'mov', 'm4a'].includes(job.format)) args.push('-movflags', '+faststart')
  if (job.width || job.height) args.push('-vf', `scale=${job.width ?? -2}:${job.height ?? -2}:force_original_aspect_ratio=decrease`)
  return [...args, job.output]
}

export function buildTargetSizePassArgs(job: JobConfig, pass: 1 | 2, passlog: string, videoKbps: number, audioKbps: number, output: string): string[] {
  const codecId = job.videoCodec ?? 'libx264'
  const codec = codecById(codecId)
  if (!codec || codec.type !== 'video' || !codec.targetSize) throw new Error(`Target-size mode is unsupported for ${codecId}`)
  const args: string[] = ['-c:v', codec.encoder, '-b:v', `${videoKbps}k`, '-pass', String(pass), '-passlogfile', passlog]
  const pixelFormat = selectedPixelFormat(job, codec)
  if (pixelFormat) args.push('-pix_fmt', pixelFormat)
  if (codec.id === 'libaom-av1') args.push('-cpu-used', String(job.cpuUsed ?? presetValue(codec.id, job.qualityMode)))
  else if (codec.id === 'librav1e') args.push('-speed', presetValue(codec.id, job.qualityMode))
  else if (codec.presets && codec.id !== 'libvpx-vp9') args.push('-preset', presetValue(codec.id, job.qualityMode))
  if (codec.id === 'libvpx-vp9') args.push('-deadline', job.deadline ?? 'good', '-cpu-used', String(job.cpuUsed ?? 4), '-row-mt', '1')
  if (codec.id === 'libaom-av1' && codec.rowMt) args.push('-row-mt', '1')
  if (codec.id === 'libsvtav1' && job.svtParams && /^[a-z0-9_-]+=[a-z0-9_.,=-]+(?:,[a-z0-9_-]+=[a-z0-9_.,=-]+)*$/i.test(job.svtParams)) args.push('-svtav1-params', job.svtParams)
  if (pass === 1) args.push('-an', '-f', 'null', '-')
  else {
    args.push('-c:a', job.audioCodec ?? defaultAudioCodecForContainer(job.format), '-b:a', `${audioKbps}k`)
    if (['mp4','mov'].includes(job.format)) args.push('-movflags','+faststart')
    args.push(output)
  }
  return args
}
