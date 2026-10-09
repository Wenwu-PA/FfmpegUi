import { describe, expect, it } from 'vitest'
import { buildFfmpegArgs } from './buildFfmpegArgs'

describe('buildFfmpegArgs', () => {
  it('creates H.264 quality conversion arguments without shell quoting paths', () => {
    expect(buildFfmpegArgs({ input: 'C:\\Видео\\a b.mp4', output: 'C:\\out\\a.mkv', format: 'mkv', preset: 'web', quality: 23 })).toEqual(['-c:v','libx264','-crf','23','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','C:\\out\\a.mkv'])
  })
  it('supports audio extraction', () => expect(buildFfmpegArgs({ input: 'in.mp4', output: 'out.mp3', format: 'mp3', preset: 'mp3', quality: 20 })).toContain('libmp3lame'))
  it('supports GIF output', () => expect(buildFfmpegArgs({ input: 'in.mp4', output: 'out.gif', format: 'gif', preset: 'gif', quality: 20 })).toContain('fps=15,scale=640:-1:flags=lanczos'))
  it('adds trim bounds', () => expect(buildFfmpegArgs({ input: 'in.mp4', output: 'out.mp4', format: 'mp4', preset: 'web', quality: 22, start: 2, duration: 5 }).slice(0, 4)).toEqual(['-ss','2','-t','5']))
})
