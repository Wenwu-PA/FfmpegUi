/** Calculates the video bitrate budget while reserving space for audio and container overhead. */
export function calculateTargetVideoBitrateKbps(targetSizeMB: number, durationSeconds: number, audioKbps = 128, overhead = 0.04): number {
  if (!Number.isFinite(targetSizeMB) || targetSizeMB <= 0) throw new RangeError('Target size must be greater than zero')
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new RangeError('Duration must be greater than zero')
  if (!Number.isFinite(audioKbps) || audioKbps < 0 || overhead < 0 || overhead >= 1) throw new RangeError('Invalid audio bitrate or overhead')
  const videoKbps = Math.floor((targetSizeMB * 8_000 * (1 - overhead)) / durationSeconds - audioKbps)
  if (videoKbps < 100) throw new RangeError('Target size is too small for this duration and audio bitrate')
  return videoKbps
}
