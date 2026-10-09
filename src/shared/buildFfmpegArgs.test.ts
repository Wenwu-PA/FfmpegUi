import { describe, expect, it } from 'vitest'
import { buildFfmpegArgs } from './buildFfmpegArgs'

const matrix = (['mp4','mkv','webm','mov','avi'] as const).flatMap(format => [18,20,22,24,26,29,32].map(quality => ({ format, quality })))

describe('buildFfmpegArgs', () => {
  it('creates H.264 quality conversion arguments without shell quoting paths', () => {
    expect(buildFfmpegArgs({ input: 'C:\\Видео\\a b.mp4', output: 'C:\\out\\a.mkv', format: 'mkv', preset: 'web', quality: 23 })).toEqual(['-c:v','libx264','-crf','23','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','C:\\out\\a.mkv'])
  })
  it('supports audio extraction', () => expect(buildFfmpegArgs({ input: 'in.mp4', output: 'out.mp3', format: 'mp3', preset: 'mp3', quality: 20 })).toContain('libmp3lame'))
  it('supports GIF output', () => expect(buildFfmpegArgs({ input: 'in.mp4', output: 'out.gif', format: 'gif', preset: 'gif', quality: 20 })).toContain('fps=15,scale=640:-1:flags=lanczos'))
  it('adds trim bounds', () => expect(buildFfmpegArgs({ input: 'in.mp4', output: 'out.mp4', format: 'mp4', preset: 'web', quality: 22, start: 2, duration: 5 }).slice(0, 4)).toEqual(['-ss','2','-t','5']))
  it('selects VP9 and Opus for WebM', () => {
    const args = buildFfmpegArgs({ input: 'in.mp4', output: 'out.webm', format: 'webm', preset: 'web', quality: 26 })
    expect(args).toContain('libvpx-vp9')
    expect(args).toContain('libopus')
    expect(args).not.toContain('-movflags')
  })
  it('selects MPEG-4 Part 2 for AVI', () => {
    const args = buildFfmpegArgs({ input: 'in.mp4', output: 'out.avi', format: 'avi', preset: 'web', quality: 24 })
    expect(args).toContain('mpeg4')
    expect(args).toContain('-q:v')
  })
  it.each(matrix)('builds a $format conversion at quality $quality with Unicode paths', ({ format, quality }) => {
    const output = `C:\\Видео с пробелом\\результат.${format}`
    const args = buildFfmpegArgs({ input: 'C:\\Мои файлы\\источник.mov', output, format, preset: 'web', quality })
    expect(args.at(-1)).toBe(output)
    expect(args).toContain('-c:v')
    expect(args).toContain(format === 'webm' ? 'libvpx-vp9' : format === 'avi' ? 'mpeg4' : 'libx264')
    expect(args).toContain(format === 'webm' ? 'libopus' : 'aac')
    expect(args).toContain(format === 'avi' ? '-q:v' : '-crf')
  })
})
