import type { JobConfig } from './types'

/** Creates deterministic FFmpeg arguments from a validated conversion configuration. */
export function buildFfmpegArgs(job: JobConfig): string[] {
  const args: string[] = []
  if (job.start !== undefined && job.start > 0) args.push('-ss', String(job.start))
  if (job.duration !== undefined && job.duration > 0) args.push('-t', String(job.duration))
  if (job.preset === 'mp3') return [...args, '-vn', '-c:a', job.audioCodec ?? 'libmp3lame', '-b:a', '192k', job.output]
  if (job.preset === 'gif' || job.format === 'gif') return [...args, '-vf', 'fps=15,scale=640:-1:flags=lanczos', '-loop', '0', job.output]
  const codec = job.videoCodec ?? (job.preset === 'h265' ? 'libx265' : 'libx264')
  args.push('-c:v', codec)
  if (codec !== 'copy') args.push('-crf', String(job.quality), '-preset', 'medium', '-pix_fmt', 'yuv420p')
  args.push('-c:a', job.audioCodec ?? 'aac', '-b:a', '192k', '-movflags', '+faststart')
  if (job.width || job.height) args.push('-vf', `scale=${job.width ?? -2}:${job.height ?? -2}:force_original_aspect_ratio=decrease`)
  return [...args, job.output]
}
