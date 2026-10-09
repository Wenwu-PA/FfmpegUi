export type FfmpegProgress = { percent: number; speed: string; bitrate: string; totalSize: number }
export type MediaStream = { index: number; codec_type: string; codec_name: string; width?: number; height?: number; avg_frame_rate?: string; channels?: number; tags?: { language?: string } }
export type ProbeResult = { format: { format_name: string; duration?: string; size?: string; bit_rate?: string }; streams: MediaStream[] }
export type MediaFile = { path: string; name: string; size: number; probe?: ProbeResult; thumbnail?: string; error?: string }
export type ConversionPreset = 'web' | 'telegram' | 'h265' | 'mp3' | 'gif'
export type JobConfig = {
  input: string; output: string; format: string; preset: ConversionPreset; quality: number
  videoCodec?: string; audioCodec?: string; imageCodec?: string; qualityMode?: import('./codecs').QualityMode
  profile?: string; pixelFormat?: string; bitDepth?: number; threads?: number; tune?: string
  rowMt?: boolean; filmGrain?: number; svtParams?: string; cpuUsed?: number; deadline?: string
  lossless?: boolean; imageQuality?: number; imageLossless?: boolean; effort?: number
  audioBitrateKbps?: number; audioQuality?: number; compressionLevel?: number
  start?: number; duration?: number; width?: number; height?: number
}

declare global {
    interface Window {
    ffmpegStudio: {
      getPathForFile(file: File): string
      chooseFiles(): Promise<string[]>; chooseDirectory(): Promise<string | null>; getSettings(): Promise<{ ffmpegPath?: string; outputDir?: string; theme: string; proxy?: string; appearance?: import('./appearance').Appearance; appearanceProfiles?: { name: string; appearance: import('./appearance').Appearance }[]; settingsVersion?: number; backgroundWarning?: string }>
      setSettings(value: unknown): Promise<boolean>; probe(file: string): Promise<ProbeResult>; thumbnail(file: string): Promise<string>
      chooseBackgroundImage(): Promise<string | null>; getProfile(): Promise<{ name: string; avatarUrl?: string }>; setProfileName(name: string): Promise<void>; setAvatarSource(source: 'windows' | 'initials'): Promise<void>; saveAvatar(bytes: Uint8Array): Promise<string>; resetProfile(): Promise<{ name: string; avatarUrl?: string }>; appInfo(): Promise<{ version: string; license: string; repository: string; ffmpegLicense: string }>; openRepository(): Promise<void>
      convert(job: unknown): Promise<{ ok: boolean; output?: string }>; cancel(id: string): Promise<void>; ffmpegStatus(): Promise<{ available: boolean; version: string; path: string; source?: string; encoders?: string[]; gpu?: string[]; encoderAvailability?: Record<string, { available: boolean; reason?: string }>; versions?: string[]; activeVersion?: string }>
      installFfmpeg(options: { build: 'essentials' | 'full'; channel: 'stable' | 'latest' }): Promise<{ ok: boolean; version: string; path: string }>
      cancelFfmpegDownload(): Promise<void>; installFfmpegOffline(): Promise<unknown>; chooseFfmpegPath(): Promise<unknown>; removeFfmpeg(): Promise<unknown>; switchFfmpegVersion(version: string): Promise<unknown>; testFfmpeg(): Promise<boolean>
      onFfmpegDownloadProgress(callback: (progress: { received: number; total: number; percent: number; speed: number; eta: number | null }) => void): () => void
      merge(job: unknown): Promise<{ ok: boolean; output?: string }>
      compress(job: unknown): Promise<{ ok: boolean; output?: string }>; recheckCodecs(): Promise<boolean>
      reveal(file: string): Promise<void>; open(file: string): Promise<string>; onProgress(callback: (progress: { id: string } & FfmpegProgress) => void): () => void
      onQueuePause(callback: (paused: boolean) => void): () => void
    }
  }
}
