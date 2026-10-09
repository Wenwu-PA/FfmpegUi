import { describe, expect, it, vi } from 'vitest'
import { calculateDownloadProgress, getResumeOffset, matchesSha256, parseFfmpegVersion, parseSha256, selectFirstWorkingCandidate } from './ffmpegInstaller'

describe('ffmpeg installer helpers', () => {
  it('selects the first working candidate and continues past a broken one', async () => {
    const validate = vi.fn(async (candidate: string) => candidate === 'managed')
    await expect(selectFirstWorkingCandidate(['custom', 'managed', 'system'], validate)).resolves.toBe('managed')
    expect(validate.mock.calls.map(([candidate]) => candidate)).toEqual(['custom', 'managed'])
  })

  it('parses version output and tolerates non-version output', () => {
    expect(parseFfmpegVersion('ffmpeg version n8.1-full_build\nbuilt with clang')).toBe('n8.1-full_build')
    expect(parseFfmpegVersion('not an ffmpeg binary')).toBeUndefined()
  })

  it('parses and checks sha256 values', () => {
    const checksum = 'a'.repeat(64)
    expect(parseSha256(`file.zip ${checksum}`)).toBe(checksum)
    expect(matchesSha256(checksum.toUpperCase(), checksum)).toBe(true)
    expect(matchesSha256('b'.repeat(64), checksum)).toBe(false)
  })

  it('resumes only when the server confirms the requested byte range', () => {
    expect(getResumeOffset(4096, 206, 'bytes 4096-8191/8192')).toBe(4096)
    expect(getResumeOffset(4096, 200, null)).toBe(0)
    expect(getResumeOffset(4096, 206, 'bytes 0-8191/8192')).toBe(0)
  })

  it('calculates percent, speed, and ETA from a streamed transfer', () => {
    expect(calculateDownloadProgress(5_000_000, 10_000_000, 1000)).toEqual({ percent: 50, speed: 5_000_000, eta: 1 })
    expect(calculateDownloadProgress(100, 0, 1000)).toEqual({ percent: 0, speed: 100, eta: null })
  })
})
