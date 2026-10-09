export type FfmpegCandidate = { ffmpeg: string; ffprobe: string }

export async function selectFirstWorkingCandidate<T>(candidates: T[], validate: (candidate: T) => Promise<boolean>): Promise<T | undefined> {
  for (const candidate of candidates) if (await validate(candidate).catch(() => false)) return candidate
  return undefined
}

export function parseFfmpegVersion(output: string): string | undefined {
  return output.match(/^ffmpeg version\s+([^\s]+)/im)?.[1]
}

export function parseSha256(value: string): string | undefined {
  return value.match(/\b[a-f0-9]{64}\b/i)?.[0]?.toLowerCase()
}

export function matchesSha256(actual: string, expected?: string): boolean {
  return !expected || actual.toLowerCase() === expected.toLowerCase()
}

export function getResumeOffset(existingBytes: number, status: number, contentRange?: string | null): number {
  return status === 206 && contentRange?.startsWith(`bytes ${existingBytes}-`) ? existingBytes : 0
}

export function calculateDownloadProgress(received: number, total: number, elapsedMs: number) {
  const speed = received / Math.max(1, elapsedMs) * 1000
  return { percent: total > 0 ? Math.min(100, received / total * 100) : 0, speed, eta: total > 0 && speed > 0 ? Math.max(0, (total - received) / speed) : null }
}
