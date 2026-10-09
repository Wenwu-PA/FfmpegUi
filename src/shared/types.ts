export type FfmpegProgress = { percent: number; speed: string; bitrate: string; totalSize: number }
export type MediaStream = { index: number; codec_type: string; codec_name: string; width?: number; height?: number; avg_frame_rate?: string; channels?: number; tags?: { language?: string } }
export type ProbeResult = { format: { format_name: string; duration?: string; size?: string; bit_rate?: string }; streams: MediaStream[] }
export type MediaFile = { path: string; name: string; size: number; probe?: ProbeResult; thumbnail?: string; error?: string }
export type ConversionPreset = 'web' | 'telegram' | 'h265' | 'mp3' | 'gif'
export type JobConfig = { input: string; output: string; format: string; preset: ConversionPreset; quality: number; videoCodec?: string; audioCodec?: string; start?: number; duration?: number; width?: number; height?: number }

declare global {
    interface Window {
    ffmpegStudio: {
      getPathForFile(file: File): string
      chooseFiles(): Promise<string[]>; chooseDirectory(): Promise<string | null>; getSettings(): Promise<{ ffmpegPath?: string; outputDir?: string; theme: string }>
      setSettings(value: unknown): Promise<boolean>; probe(file: string): Promise<ProbeResult>; thumbnail(file: string): Promise<string>
      convert(job: unknown): Promise<{ ok: boolean; output?: string }>; cancel(id: string): Promise<void>; ffmpegStatus(): Promise<{ available: boolean; version: string; path: string }>
      merge(job: unknown): Promise<{ ok: boolean; output?: string }>
      compress(job: unknown): Promise<{ ok: boolean; output?: string }>
      reveal(file: string): Promise<void>; open(file: string): Promise<string>; onProgress(callback: (progress: { id: string } & FfmpegProgress) => void): () => void
    }
  }
}
