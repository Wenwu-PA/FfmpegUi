import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { FfmpegProgress } from '../src/shared/types'

contextBridge.exposeInMainWorld('ffmpegStudio', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  chooseFiles: () => ipcRenderer.invoke('dialog:files') as Promise<string[]>,
  chooseDirectory: () => ipcRenderer.invoke('dialog:directory') as Promise<string | null>,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (value: unknown) => ipcRenderer.invoke('settings:set', value),
  probe: (file: string) => ipcRenderer.invoke('media:probe', file),
  thumbnail: (file: string) => ipcRenderer.invoke('media:thumbnail', file) as Promise<string>,
  convert: (job: unknown) => ipcRenderer.invoke('media:convert', job),
  merge: (job: unknown) => ipcRenderer.invoke('media:merge', job),
  compress: (job: unknown) => ipcRenderer.invoke('media:compress', job),
  cancel: (id: string) => ipcRenderer.invoke('job:cancel', id),
  ffmpegStatus: () => ipcRenderer.invoke('ffmpeg:status'),
  installFfmpeg: (options: { build: 'essentials' | 'full'; channel: 'stable' | 'latest' }) => ipcRenderer.invoke('ffmpeg:install', options),
  cancelFfmpegDownload: () => ipcRenderer.invoke('ffmpeg:cancel-download'),
  installFfmpegOffline: () => ipcRenderer.invoke('ffmpeg:install-offline'),
  chooseFfmpegPath: () => ipcRenderer.invoke('ffmpeg:choose-path'),
  removeFfmpeg: () => ipcRenderer.invoke('ffmpeg:remove-managed'),
  switchFfmpegVersion: (version: string) => ipcRenderer.invoke('ffmpeg:switch-version', version),
  testFfmpeg: () => ipcRenderer.invoke('ffmpeg:test'),
  reveal: (file: string) => ipcRenderer.invoke('app:reveal', file),
  open: (file: string) => ipcRenderer.invoke('app:open', file),
  onProgress: (callback: (progress: { id: string } & FfmpegProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: { id: string } & FfmpegProgress) => callback(progress)
    ipcRenderer.on('job:progress', listener)
    return () => ipcRenderer.removeListener('job:progress', listener)
  },
  onQueuePause: (callback: (paused: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, paused: boolean) => callback(paused)
    ipcRenderer.on('queue:toggle', listener)
    return () => ipcRenderer.removeListener('queue:toggle', listener)
  },
  onFfmpegDownloadProgress: (callback: (progress: { received: number; total: number; percent: number; speed: number; eta: number | null }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: { received: number; total: number; percent: number; speed: number; eta: number | null }) => callback(progress)
    ipcRenderer.on('ffmpeg:download-progress', listener)
    return () => ipcRenderer.removeListener('ffmpeg:download-progress', listener)
  },
})
