import type { JobConfig } from './types'

/** Creates deterministic FFmpeg arguments from a validated conversion configuration. */
export function buildFfmpegArgs(job: JobConfig): string[] {
  const args: string[] = []
  if (job.start !== undefined && job.start > 0) args.push('-ss', String(job.start))
  if (job.duration !== undefined && job.duration > 0) args.push('-t', String(job.duration))
  if (job.preset === 'mp3') return [...args, '-vn', '-c:a', job.audioCodec ?? 'libmp3lame', '-b:a', '192k', job.output]
  if (job.preset === 'gif' || job.format === 'gif') return [...args, '-vf', 'fps=15,scale=640:-1:flags=lanczos', '-loop', '0', job.output]
  const codec = job.videoCodec ?? (job.format === 'webm' ? 'libvpx-vp9' : job.format === 'avi' ? 'mpeg4' : job.preset === 'h265' ? 'libx265' : 'libx264')
  args.push('-c:v', codec)
  if (codec !== 'copy') {
    if (codec === 'mpeg4') args.push('-q:v', String(Math.max(2, Math.min(31, Math.round(job.quality / 4)))))
    else args.push('-crf', String(job.quality))
    if (codec === 'libvpx-vp9') args.push('-b:v', '0', '-deadline', 'good', '-cpu-used', '4')
    if (codec === 'libx264' || codec === 'libx265') args.push('-preset', 'medium')
    args.push('-pix_fmt', 'yuv420p')
    if (job.preset === 'telegram') args.push('-maxrate', '4M', '-bufsize', '8M')
  }
  args.push('-c:a', job.audioCodec ?? (job.format === 'webm' ? 'libopus' : 'aac'), '-b:a', '192k')
  if (['mp4', 'mov'].includes(job.format)) args.push('-movflags', '+faststart')
  if (job.width || job.height) args.push('-vf', `scale=${job.width ?? -2}:${job.height ?? -2}:force_original_aspect_ratio=decrease`)
  return [...args, job.output]
}
