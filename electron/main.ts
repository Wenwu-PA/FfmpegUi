import { app, BrowserWindow, dialog, ipcMain, shell, protocol, net } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import Store from 'electron-store'
import { z } from 'zod'
import type { FfmpegProgress } from '../src/shared/types'

const store = new Store<{ ffmpegPath?: string; outputDir?: string; theme?: string }>({ name: 'settings' })
const settings = store as unknown as { get(key: string): string | undefined; set(key: string, value: unknown): void }
const active = new Map<string, ReturnType<typeof spawn>>()
const mediaPaths = new Set<string>()
let mainWindow: BrowserWindow | null = null
let quitWhenIdle = false
let allowQuit = false
let quitTimer: NodeJS.Timeout | undefined

function finishQuitWhenIdle() {
  if (quitWhenIdle && active.size === 0) {
    if (quitTimer) clearTimeout(quitTimer)
    allowQuit = true
    app.quit()
  }
}

protocol.registerSchemesAsPrivileged([{ scheme: 'app-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

const run = (bin: string, args: string[]) => new Promise<string>((resolve, reject) => {
  const child = spawn(bin, args, { windowsHide: true })
  let out = ''; let err = ''
  child.stdout?.on('data', data => { out += data.toString() })
  child.stderr?.on('data', data => { err += data.toString() })
  child.on('error', reject)
  child.on('close', code => code === 0 ? resolve(out) : reject(new Error(err || `Process exited ${code}`)))
})

function locate(binary: 'ffmpeg' | 'ffprobe'): string {
  const configured = settings.get('ffmpegPath')
  const names = binary === 'ffmpeg' ? ['ffmpeg.exe', 'ffmpeg'] : ['ffprobe.exe', 'ffprobe']
  const candidates = [
    ...(configured ? [path.join(path.dirname(configured), names[0]), binary === 'ffmpeg' ? configured : ''] : []),
    path.join(process.resourcesPath, 'bin', names[0]), names[1],
  ].filter(Boolean)
  return candidates.find(candidate => candidate.includes(path.sep) ? existsSync(candidate) : true) ?? names[1]
}

function unusedOutputPath(file: string): string {
  if (!existsSync(file)) return file
  const directory = path.dirname(file)
  const extension = path.extname(file)
  const stem = path.basename(file, extension)
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = path.join(directory, `${stem} (${suffix})${extension}`)
    if (!existsSync(candidate)) return candidate
  }
  throw new Error('Не удалось подобрать свободное имя для результата')
}

function registerIpc() {
  ipcMain.handle('dialog:files', async () => (await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Медиа', extensions: ['mp4','mkv','mov','webm','avi','mp3','wav','flac','m4a','ogg','png','jpg','jpeg','webp','gif'] }] })).filePaths)
  ipcMain.handle('dialog:directory', async () => (await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })).filePaths[0] ?? null)
  ipcMain.handle('settings:get', () => ({ ffmpegPath: settings.get('ffmpegPath'), outputDir: settings.get('outputDir'), theme: settings.get('theme') ?? 'dark' }))
  ipcMain.handle('settings:set', (_event, input: unknown) => {
    const value = z.object({ ffmpegPath: z.string().optional(), outputDir: z.string().optional(), theme: z.enum(['dark','light','system']).optional() }).parse(input)
    for (const [key, item] of Object.entries(value)) if (item !== undefined) settings.set(key, item)
    return true
  })
  ipcMain.handle('media:probe', async (_event, file: unknown) => {
    const filePath = z.string().min(1).parse(file)
    mediaPaths.add(path.resolve(filePath))
    const json = await run(locate('ffprobe'), ['-v','error','-print_format','json','-show_format','-show_streams',filePath])
    return JSON.parse(json) as unknown
  })
  ipcMain.handle('media:thumbnail', async (_event, file: unknown) => {
    const filePath = z.string().min(1).parse(file)
    const out = path.join(app.getPath('temp'), `ffmpeg-studio-${Date.now()}.jpg`)
    await run(locate('ffmpeg'), ['-y','-ss','00:00:01','-i',filePath,'-frames:v','1','-vf','scale=320:-1',out])
    mediaPaths.add(path.resolve(out))
    return `app-media://local/?path=${encodeURIComponent(out)}`
  })
  ipcMain.handle('media:convert', async (event, input: unknown) => {
    const job = z.object({ id: z.string(), input: z.string(), output: z.string(), args: z.array(z.string()), duration: z.number().nonnegative().optional() }).parse(input)
    const output = unusedOutputPath(job.output)
    const child = spawn(locate('ffmpeg'), ['-n','-i',job.input,...job.args,'-progress','pipe:1','-nostats',output], { windowsHide: true, stdio: ['pipe','pipe','pipe'] })
    active.set(job.id, child)
    let buffer = ''; let log = ''
    return await new Promise((resolve, reject) => {
      child.stdout?.on('data', data => {
        buffer += data.toString()
        const rows = buffer.split(/\r?\n/); buffer = rows.pop() ?? ''
        const info: Record<string,string> = {}
        for (const row of rows) { const [key,...rest] = row.split('='); if (key) info[key] = rest.join('=') }
        if (info.out_time_us) {
          const progress: FfmpegProgress = { percent: job.duration ? Math.min(100, (Number(info.out_time_us) / 1_000_000 / job.duration) * 100) : 0, speed: info.speed ?? '0x', bitrate: info.bitrate ?? '—', totalSize: Number(info.total_size ?? 0) }
          event.sender.send('job:progress', { id: job.id, ...progress })
        }
      })
      child.stderr?.on('data', data => { log = (log + data.toString()).slice(-16_000) })
      child.on('error', error => { active.delete(job.id); reject(error); finishQuitWhenIdle() })
      child.on('close', code => {
        active.delete(job.id)
        if (code === 0) resolve({ ok: true, output })
        else reject(new Error(log || `FFmpeg завершился с кодом ${code}`))
        finishQuitWhenIdle()
      })
    })
  })
  ipcMain.handle('job:cancel', (_event, id: unknown) => {
    const jobId = z.string().parse(id); const child = active.get(jobId)
    child?.stdin?.write('q\n'); setTimeout(() => { if (child && active.has(jobId)) child.kill() }, 1500).unref()
  })
  ipcMain.handle('ffmpeg:status', async () => {
    try { return { available: true, version: (await run(locate('ffmpeg'), ['-version'])).split('\n')[0], path: locate('ffmpeg') } }
    catch { return { available: false, version: '', path: '' } }
  })
  ipcMain.handle('app:reveal', (_event, file: unknown) => { shell.showItemInFolder(z.string().parse(file)) })
  ipcMain.handle('app:open', (_event, file: unknown) => shell.openPath(z.string().parse(file)))
}

async function createWindow() {
  mainWindow = new BrowserWindow({ width: 1440, height: 920, minWidth: 960, minHeight: 600, backgroundColor: '#0b0d12', title: 'FFmpeg Studio', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', event => event.preventDefault())
  if (process.env.VITE_DEV_SERVER_URL) await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else await mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
}

app.whenReady().then(() => {
  protocol.handle('app-media', request => {
    const file = new URL(request.url).searchParams.get('path')
    if (!file || !mediaPaths.has(path.resolve(file))) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(file).toString())
  })
  registerIpc(); void createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
})
app.on('before-quit', event => {
  if (allowQuit || active.size === 0) { allowQuit = true; return }
  event.preventDefault()
  quitWhenIdle = true
  for (const child of active.values()) child.stdin?.write('q\n')
  quitTimer = setTimeout(() => {
    for (const child of active.values()) child.kill()
    quitTimer = setTimeout(() => { allowQuit = true; app.quit() }, 300)
  }, 1500)
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
