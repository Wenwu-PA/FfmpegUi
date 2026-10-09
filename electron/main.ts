import { app, BrowserWindow, dialog, ipcMain, shell, protocol, net, Menu, nativeImage, Tray, session } from 'electron'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, open, readFile, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises'
import { path7za } from '7zip-bin'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import Store from 'electron-store'
import { z } from 'zod'
import type { FfmpegProgress } from '../src/shared/types'
import { calculateDownloadProgress, getResumeOffset, matchesSha256, parseFfmpegVersion, parseSha256, selectFirstWorkingCandidate } from '../src/shared/ffmpegInstaller'

const store = new Store<{ ffmpegPath?: string; outputDir?: string; theme?: string; ffmpegVersion?: string; proxy?: string }>({ name: 'settings' })
const settings = store as unknown as { get(key: string): string | undefined; set(key: string, value: unknown): void }
const active = new Map<string, ReturnType<typeof spawn>>()
const mediaPaths = new Set<string>()
const downloads = new Map<number, AbortController>()
const localPathSchema = z.string().min(1).refine(file => path.isAbsolute(file) && !/[\r\n\0]/.test(file), 'Expected an absolute local path')
const ffmpegArgsSchema = z.array(z.string().max(2048).refine(argument => !/^-(?:f|i|protocol_whitelist|protocol_blacklist|filter_complex|lavfi|progress|nostats)$/i.test(argument) && !/^(?:https?|tcp|udp|rtmp|smb):/i.test(argument), 'Unsafe FFmpeg argument')).max(100)
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let resolvedBinaries: { ffmpeg: string; ffprobe: string } | undefined
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

const run = (bin: string, args: string[], timeoutMs = 15_000) => new Promise<string>((resolve, reject) => {
  const child = spawn(bin, args, { windowsHide: true })
  let out = ''; let err = ''
  const timer = setTimeout(() => { child.kill(); reject(new Error(`Process timed out: ${bin}`)) }, timeoutMs)
  child.stdout?.on('data', data => { out += data.toString() })
  child.stderr?.on('data', data => { err += data.toString() })
  child.on('error', error => { clearTimeout(timer); reject(error) })
  child.on('close', code => { clearTimeout(timer); if (code === 0) resolve(out); else reject(new Error(err || `Process exited ${code}`)) })
})

function locate(binary: 'ffmpeg' | 'ffprobe'): string {
  if (resolvedBinaries?.[binary]) return resolvedBinaries[binary]
  const configured = settings.get('ffmpegPath')
  const names = binary === 'ffmpeg' ? ['ffmpeg.exe', 'ffmpeg'] : ['ffprobe.exe', 'ffprobe']
  const candidates = [
    ...(configured ? [path.join(path.dirname(configured), names[0]), binary === 'ffmpeg' ? configured : ''] : []),
    ...(settings.get('ffmpegVersion') ? [path.join(app.getPath('userData'), 'ffmpeg', settings.get('ffmpegVersion')!, names[0])] : []),
    path.join(process.resourcesPath, 'bin', names[0]), names[1],
  ].filter(Boolean)
  return candidates.find(candidate => candidate.includes(path.sep) ? existsSync(candidate) : true) ?? names[1]
}

function parseFfmpegFiles(value: string) { return { ffmpeg: parseFfmpegVersion(value) ?? '', date: value.match(/^built with .*$/mi)?.[0] ?? '' } }

async function findBinary(root: string, name: string, depth = 0): Promise<string | undefined> {
  if (depth > 6) return undefined
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const candidate = path.join(root, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === (process.platform === 'win32' ? `${name}.exe` : name)) return candidate
    if (entry.isDirectory()) { const found = await findBinary(candidate, name, depth + 1); if (found) return found }
  }
  return undefined
}

type SourceEntry = { url?: string; urls?: string[]; sha256Url?: string; versionUrl?: string; format: string; version?: string; ffmpeg?: string; ffprobe?: string; mirrorApi?: string; mirrorPattern?: string }
type SourceManifest = {
  windows: Record<'stable' | 'latest', Record<'essentials' | 'full', SourceEntry>> & { fallback: Record<'stable' | 'latest', string> & { assetPattern: string } }
  macos: Record<'stable' | 'latest', SourceEntry>
  linux: Record<'stable' | 'latest', SourceEntry>
}
async function getFfmpegSources(): Promise<SourceManifest> {
  const sourcesPath = app.isPackaged ? path.join(process.resourcesPath, 'ffmpeg-sources.json') : path.join(app.getAppPath(), 'resources', 'ffmpeg-sources.json')
  return JSON.parse(await readFile(sourcesPath, 'utf8')) as SourceManifest
}

async function resolveDownloadSource(build: 'essentials' | 'full', channel: 'stable' | 'latest') {
  const sources = await getFfmpegSources()
  if (process.platform === 'win32') {
    const source = sources.windows[channel][build]
    return { ...source, mirrorApi: sources.windows.fallback[channel], mirrorPattern: sources.windows.fallback.assetPattern }
  }
  if (process.platform === 'darwin') {
    const source = sources.macos[channel]
    return { ...source, format: 'zip', urls: [source.ffmpeg, source.ffprobe].filter((url): url is string => Boolean(url)) }
  }
  const source = sources.linux[channel]
  return { ...source, urls: [source.url].filter((url): url is string => Boolean(url)) }
}

async function getSourceUrls(source: { url?: string; urls?: string[]; sha256Url?: string; versionUrl?: string; version?: string; mirrorApi?: string; mirrorPattern?: string }) {
  let expectedSha256: string | undefined
  let version = source.version ?? 'latest'
  const metadataSignal = AbortSignal.timeout(10_000)
  if (source.sha256Url) {
    const response = await net.fetch(source.sha256Url, { signal: metadataSignal }).catch(() => undefined)
    if (response?.ok) expectedSha256 = parseSha256(await response.text())
  }
  if (source.versionUrl) {
    const response = await net.fetch(source.versionUrl, { signal: metadataSignal }).catch(() => undefined)
    if (response?.ok) version = (await response.text()).trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80) || version
  }
  const urls = [...(source.urls ?? (source.url ? [source.url] : []))]
  if (source.mirrorApi) {
    try {
      const api = await net.fetch(source.mirrorApi, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FFmpeg-Studio' } })
      if (api.ok) {
        const release = await api.json() as { assets?: { name: string; browser_download_url: string }[]; tag_name?: string }
        const asset = release.assets?.find(item => item.name.endsWith(source.mirrorPattern ?? ''))
        if (asset) urls.push(asset.browser_download_url)
        if (release.tag_name) version = release.tag_name.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80)
      }
    } catch { /* Gyan remains the primary source when the mirror API is unavailable. */ }
  }
  return { urls: [...new Set(urls)], expectedSha256, version }
}

async function downloadFile(url: string, target: string, signal: AbortSignal, onProgress: (received: number, total: number) => void) {
  let resume = (await stat(target).catch(() => undefined))?.size ?? 0
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (signal.aborted) throw new Error('Download cancelled')
    if (attempt) await new Promise(resolve => setTimeout(resolve, 500 * (2 ** (attempt - 1))))
    let output: Awaited<ReturnType<typeof open>> | undefined
    try {
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      const response = await net.fetch(url, { signal: requestSignal, headers: resume ? { Range: `bytes=${resume}-` } : {} })
      if (!response.ok || !response.body) throw new Error(`Download failed with HTTP ${response.status}`)
      const appendOffset = getResumeOffset(resume, response.status, response.headers.get('content-range'))
      if (appendOffset !== resume) { resume = 0; await rm(target, { force: true }) }
      const rangeTotal = Number(response.headers.get('content-range')?.split('/').at(-1))
      const length = Number(response.headers.get('content-length'))
      const total = rangeTotal || (length ? length + resume : 0)
      output = await open(target, resume ? 'a' : 'w')
      let received = resume
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        await output.write(value)
        received += value.byteLength
        onProgress(received, total)
      }
      await output.close()
      output = undefined
      if (total && received !== total) throw new Error('Download ended before the full file was received')
      return received
    } catch (error) {
      await output?.close().catch(() => undefined)
      if (signal.aborted) throw new Error('Download cancelled')
      resume = (await stat(target).catch(() => undefined))?.size ?? 0
      if (attempt === 3) throw error
    }
  }
  throw new Error('Download failed after three attempts')
}

async function refreshFfmpegSelection() {
  resolvedBinaries = undefined
  const configured = settings.get('ffmpegPath')
  const ffmpegNames = process.platform === 'win32' ? ['ffmpeg.exe', 'ffmpeg'] : ['ffmpeg']
  const ffprobeNames = process.platform === 'win32' ? ['ffprobe.exe', 'ffprobe'] : ['ffprobe']
  const installedRoot = path.join(app.getPath('userData'), 'ffmpeg')
  const versions = (await readdir(installedRoot).catch(() => [])).sort().reverse()
  const installedCandidates = (await Promise.all(versions.map(version => findBinary(path.join(installedRoot, version), 'ffmpeg')))).filter((candidate): candidate is string => Boolean(candidate))
  const candidates = [
    ...(configured ? [configured] : []),
    ...installedCandidates,
    path.join(process.resourcesPath, 'bin', ffmpegNames[0]!),
    ffmpegNames.at(-1)!,
  ]
  const versionByCandidate = new Map<string, string>()
  const selected = await selectFirstWorkingCandidate(candidates, async candidate => {
    if (candidate.includes(path.sep) && !existsSync(candidate)) return false
    const siblingProbe = candidate.includes(path.sep) ? path.join(path.dirname(candidate), ffprobeNames[0]!) : ffprobeNames.at(-1)!
    try {
      const versionText = await run(candidate, ['-version'], 4000)
      await run(siblingProbe, ['-version'], 4000)
      if (!parseFfmpegVersion(versionText)) return false
      versionByCandidate.set(candidate, versionText.split(/\r?\n/)[0] ?? '')
      resolvedBinaries = { ffmpeg: candidate, ffprobe: siblingProbe }
      return true
    } catch { return false }
  })
  if (selected) return { available: true, version: versionByCandidate.get(selected) ?? '', path: selected, source: selected === configured ? 'custom' : selected.startsWith(installedRoot) ? 'managed' : selected.includes('resources') ? 'bundled' : 'system' }
  return { available: false, version: '', path: '', source: 'missing' }
}

async function extractAndInstall(archivePaths: string[], version: string, expectedSha256?: string) {
  const root = path.join(app.getPath('userData'), 'ffmpeg')
  await mkdir(root, { recursive: true })
  const available = await statfs(root)
  const freeBytes = Number(available.bavail) * Number(available.bsize)
  if (freeBytes < 512 * 1024 * 1024) throw new Error('Недостаточно свободного места: требуется не менее 512 МБ.')
  const archive = archivePaths[0]!
  const fileStats = await stat(archive)
  if (fileStats.size < 1024 * 1024) throw new Error('Скачанный архив слишком мал и не похож на сборку FFmpeg.')
  if (expectedSha256) {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(archive)) hash.update(chunk)
    if (!matchesSha256(hash.digest('hex'), expectedSha256)) throw new Error('SHA-256 архива не совпал с опубликованной контрольной суммой. Архив удалён, установка отменена.')
  }
  const staging = path.join(root, `.install-${randomUUID()}`)
  let destination = ''
  await mkdir(staging, { recursive: true })
  try {
    for (const archivePath of archivePaths) {
      await run(path7za, ['x', '-y', `-o${staging}`, archivePath], 180_000)
      if (archivePath.endsWith('.xz')) {
        for (const entry of await readdir(staging, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.toLowerCase().endsWith('.tar')) await run(path7za, ['x', '-y', `-o${staging}`, path.join(staging, entry.name)], 180_000)
        }
      }
    }
    const ffmpegPath = await findBinary(staging, 'ffmpeg')
    const ffprobePath = await findBinary(staging, 'ffprobe')
    if (!ffmpegPath || !ffprobePath) throw new Error('В архиве не найдены ffmpeg и ffprobe.')
    const versionText = await run(ffmpegPath, ['-version'], 5000)
    const parsedVersion = parseFfmpegVersion(versionText)
    if (!parsedVersion) throw new Error('Скачанный ffmpeg не вернул номер версии.')
    await run(ffprobePath, ['-version'], 5000)
    const variant = version.match(/(essentials|full|offline)$/)?.[1] ?? 'managed'
    destination = path.join(root, `${parsedVersion}-${variant}`.replace(/[^a-zA-Z0-9._-]/g, '_'))
    const old = `${destination}.old-${randomUUID()}`
    if (existsSync(destination)) await rename(destination, old)
    await rename(staging, destination)
    await rm(old, { recursive: true, force: true }).catch(() => undefined)
    const relativeBinary = path.relative(staging, ffmpegPath)
    const installedBinary = path.join(destination, relativeBinary)
    store.delete('ffmpegPath')
    settings.set('ffmpegVersion', path.basename(destination))
    resolvedBinaries = { ffmpeg: installedBinary, ffprobe: installedBinary.replace(/ffmpeg(?:\.exe)?$/i, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe') }
    return { version: path.basename(destination), path: installedBinary }
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error }
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

function createPartPath(file: string): string {
  const extension = path.extname(file)
  return path.join(path.dirname(file), `${path.basename(file, extension)}.${randomUUID()}.part${extension}`)
}

function friendlyFfmpegError(log: string, code: number | null): string {
  const text = log.toLowerCase()
  const hint = text.includes('no space left') || text.includes('disk full') ? 'На диске недостаточно места.'
    : text.includes('unknown encoder') || text.includes('encoder not found') ? 'В этой сборке FFmpeg нет нужного кодека.'
    : text.includes('invalid data found') || text.includes('moov atom not found') ? 'Файл повреждён или имеет неподдерживаемый формат.'
    : text.includes('permission denied') || text.includes('access is denied') ? 'Нет разрешения читать файл или записать результат.'
    : text.includes('matches no streams') ? 'В исходном файле нет подходящих аудио- или видеопотоков.'
    : ''
  return `${hint ? `${hint}\n\n` : ''}${log || `FFmpeg завершился с кодом ${code}`}`
}

function registerIpc() {
  ipcMain.handle('dialog:files', async () => (await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Медиа', extensions: ['mp4','mkv','mov','webm','avi','mp3','wav','flac','m4a','ogg','png','jpg','jpeg','webp','gif'] }] })).filePaths)
  ipcMain.handle('dialog:directory', async () => (await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })).filePaths[0] ?? null)
  ipcMain.handle('settings:get', () => ({ ffmpegPath: settings.get('ffmpegPath'), outputDir: settings.get('outputDir'), theme: settings.get('theme') ?? 'dark', proxy: settings.get('proxy') ?? '' }))
  ipcMain.handle('settings:set', (_event, input: unknown) => {
    const value = z.object({ ffmpegPath: localPathSchema.optional(), outputDir: localPathSchema.optional(), theme: z.enum(['dark','light','system']).optional(), proxy: z.string().max(500).optional() }).parse(input)
    for (const [key, item] of Object.entries(value)) if (item !== undefined) settings.set(key, item)
    if (value.ffmpegPath !== undefined) void refreshFfmpegSelection()
    return true
  })
  ipcMain.handle('ffmpeg:install', async (event, input: unknown) => {
    const options = z.object({ build: z.enum(['essentials', 'full']), channel: z.enum(['stable', 'latest']) }).parse(input)
    const senderId = event.sender.id
    if (downloads.has(senderId)) throw new Error('Загрузка FFmpeg уже выполняется.')
    const controller = new AbortController(); downloads.set(senderId, controller)
    const tempRoot = path.join(app.getPath('temp'), `ffmpeg-studio-download-${randomUUID()}`)
    const startedAt = Date.now()
    try {
      const proxy = settings.get('proxy')
      if (proxy) { const parsed = new URL(proxy); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Прокси должен использовать HTTP или HTTPS.'); await session.defaultSession.setProxy({ mode: 'fixed_servers', proxyRules: proxy }) }
      else await session.defaultSession.setProxy({ mode: 'system' })
      const free = await statfs(app.getPath('userData'))
      if (Number(free.bavail) * Number(free.bsize) < 512 * 1024 * 1024) throw new Error('Недостаточно свободного места: требуется не менее 512 МБ.')
      await mkdir(tempRoot, { recursive: true })
      const source = await resolveDownloadSource(options.build, options.channel)
      const { urls, expectedSha256, version } = await getSourceUrls(source)
      if (!urls.length) throw new Error('Для этой системы не настроен источник FFmpeg.')
      const archives: string[] = []
      let verifiedSha256: string | undefined
      for (let index = 0; index < urls.length; index += 1) {
        const archive = path.join(tempRoot, `ffmpeg-${index}.${source.format}`)
        try {
          const size = await downloadFile(urls[index]!, archive, controller.signal, (received, total) => {
            const elapsed = Math.max(1, Date.now() - startedAt) / 1000
      const progress = calculateDownloadProgress(received, total, elapsed * 1000)
      event.sender.send('ffmpeg:download-progress', { received, total, ...progress })
          })
          if (size < 1024 * 1024) throw new Error('Источник вернул файл меньше 1 МБ.')
          if (index === 0 && expectedSha256) {
            const hash = createHash('sha256')
            for await (const chunk of createReadStream(archive)) hash.update(chunk)
            if (!matchesSha256(hash.digest('hex'), expectedSha256)) throw new Error('SHA-256 архива не совпал. Файл удалён, установка отменена.')
            verifiedSha256 = expectedSha256
          }
          archives.push(archive)
          if (process.platform !== 'darwin') break
        } catch (error) {
          await rm(archive, { force: true })
          if (controller.signal.aborted) throw new Error('Загрузка отменена.')
          if (error instanceof Error && error.message.startsWith('SHA-256')) throw error
          if (index === urls.length - 1) throw error
        }
      }
      const installed = await extractAndInstall(archives, `${version}-${options.build}`, verifiedSha256)
      return { ok: true, ...installed, status: await refreshFfmpegSelection() }
    } catch (error) {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
      throw new Error(error instanceof Error ? error.message : 'Не удалось установить FFmpeg.')
    } finally { downloads.delete(senderId); await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined) }
  })
  ipcMain.handle('ffmpeg:cancel-download', event => downloads.get(event.sender.id)?.abort())
  ipcMain.handle('ffmpeg:install-offline', async () => {
    const choice = await dialog.showOpenDialog({ properties: ['openFile', 'openDirectory'], filters: [{ name: 'Архив FFmpeg', extensions: ['zip', '7z', 'xz', 'tar'] }] })
    const archive = choice.filePaths[0]
    if (!archive) return null
    if ((await stat(archive)).isDirectory()) {
      const ffmpegPath = await findBinary(archive, 'ffmpeg'); const ffprobePath = await findBinary(archive, 'ffprobe')
      if (!ffmpegPath || !ffprobePath) throw new Error('В выбранной папке не найдены ffmpeg и ffprobe.')
      await run(ffmpegPath, ['-version'], 5000); await run(ffprobePath, ['-version'], 5000)
      settings.set('ffmpegPath', ffmpegPath); resolvedBinaries = { ffmpeg: ffmpegPath, ffprobe: ffprobePath }
      return { path: ffmpegPath, status: await refreshFfmpegSelection() }
    }
    const installed = await extractAndInstall([archive], `offline-${Date.now()}`)
    return { ...installed, status: await refreshFfmpegSelection() }
  })
  ipcMain.handle('ffmpeg:choose-path', async () => {
    const choice = await dialog.showOpenDialog({ properties: ['openFile'], ...(process.platform === 'win32' ? { filters: [{ name: 'FFmpeg', extensions: ['exe'] }] } : {}) })
    const ffmpegPath = choice.filePaths[0]
    if (!ffmpegPath) return null
    const ffprobePath = path.join(path.dirname(ffmpegPath), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
    await run(ffmpegPath, ['-version'], 5000); await run(ffprobePath, ['-version'], 5000)
    settings.set('ffmpegPath', ffmpegPath); store.delete('ffmpegVersion')
    return refreshFfmpegSelection()
  })
  ipcMain.handle('ffmpeg:remove-managed', async () => {
    const version = settings.get('ffmpegVersion')
    if (!version) return false
    await rm(path.join(app.getPath('userData'), 'ffmpeg', version), { recursive: true, force: true })
    store.delete('ffmpegVersion'); resolvedBinaries = undefined
    return refreshFfmpegSelection()
  })
  ipcMain.handle('ffmpeg:switch-version', async (_event, input: unknown) => {
    const version = z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/).parse(input)
    const root = path.join(app.getPath('userData'), 'ffmpeg', version)
    const ffmpeg = await findBinary(root, 'ffmpeg'); const ffprobe = await findBinary(root, 'ffprobe')
    if (!ffmpeg || !ffprobe) throw new Error('Выбранная версия FFmpeg повреждена или неполная.')
    await run(ffmpeg, ['-version'], 5000); await run(ffprobe, ['-version'], 5000)
    settings.set('ffmpegVersion', version); store.delete('ffmpegPath')
    return refreshFfmpegSelection()
  })
  ipcMain.handle('ffmpeg:test', async () => {
    const status = await refreshFfmpegSelection()
    if (!status.available) throw new Error('FFmpeg не найден.')
    const nullOutput = process.platform === 'win32' ? 'NUL' : '/dev/null'
    await run(status.path, ['-hide_banner', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=10', '-t', '1', '-c:v', 'libx264', '-f', 'null', nullOutput], 20_000)
    return true
  })
  ipcMain.handle('media:probe', async (_event, file: unknown) => {
    const filePath = localPathSchema.parse(file)
    mediaPaths.add(path.resolve(filePath))
    const json = await run(locate('ffprobe'), ['-v','error','-print_format','json','-show_format','-show_streams',filePath])
    return JSON.parse(json) as unknown
  })
  ipcMain.handle('media:thumbnail', async (_event, file: unknown) => {
    const filePath = localPathSchema.parse(file)
    const out = path.join(app.getPath('temp'), `ffmpeg-studio-${Date.now()}.jpg`)
    await run(locate('ffmpeg'), ['-y','-ss','00:00:01','-i',filePath,'-frames:v','1','-vf','scale=320:-1',out])
    mediaPaths.add(path.resolve(out))
    return `app-media://local/?path=${encodeURIComponent(out)}`
  })
  ipcMain.handle('media:convert', async (event, input: unknown) => {
    const job = z.object({ id: z.string(), input: localPathSchema, output: localPathSchema, args: ffmpegArgsSchema, duration: z.number().nonnegative().optional() }).parse(input)
    const output = unusedOutputPath(job.output)
    const partOutput = createPartPath(output)
    const child = spawn(locate('ffmpeg'), ['-n','-i',job.input,...job.args,'-progress','pipe:1','-nostats',partOutput], { windowsHide: true, stdio: ['pipe','pipe','pipe'] })
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
      child.on('error', error => { active.delete(job.id); void rm(partOutput, { force: true }).catch(() => undefined); reject(error); finishQuitWhenIdle() })
      child.on('close', code => { void (async () => {
        try {
          if (code === 0) { await rename(partOutput, output); resolve({ ok: true, output }) }
          else { await rm(partOutput, { force: true }); reject(new Error(friendlyFfmpegError(log, code))) }
        } catch (error) { await rm(partOutput, { force: true }).catch(() => undefined); reject(error) }
        finally { active.delete(job.id); finishQuitWhenIdle() }
      })() })
    })
  })
  ipcMain.handle('media:merge', async (event, input: unknown) => {
    const job = z.object({ id: z.string(), inputs: z.array(localPathSchema).min(2), output: localPathSchema }).parse(input)
    const probes = await Promise.all(job.inputs.map(file => run(locate('ffprobe'), ['-v','error','-print_format','json','-show_format','-show_streams',file]).then(JSON.parse))) as { streams: { codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string; channels?: number; sample_rate?: string }[]; format: { duration?: string } }[]
    const layout = (streams: typeof probes[number]['streams']) => JSON.stringify(streams.filter(stream => ['video','audio'].includes(stream.codec_type)).map(({ codec_type,codec_name,width,height,r_frame_rate,channels,sample_rate }) => ({ codec_type,codec_name,width,height,r_frame_rate,channels,sample_rate })))
    if (probes.some(probe => layout(probe.streams) !== layout(probes[0]!.streams))) throw new Error('Для быстрой склейки нужны файлы с одинаковыми видео- и аудиопараметрами.')
    const duration = probes.reduce((sum, probe) => sum + Number(probe.format.duration ?? 0), 0)
    const manifest = path.join(app.getPath('temp'), `ffmpeg-studio-${randomUUID()}.ffconcat`)
    const entries = job.inputs.map(file => `file '${path.resolve(file).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n')
    await writeFile(manifest, `ffconcat version 1.0\n${entries}\n`, 'utf8')
    const output = unusedOutputPath(job.output)
    const partOutput = createPartPath(output)
    const child = spawn(locate('ffmpeg'), ['-n','-f','concat','-safe','0','-i',manifest,'-c','copy','-progress','pipe:1','-nostats',partOutput], { windowsHide: true, stdio: ['pipe','pipe','pipe'] })
    active.set(job.id, child)
    let buffer = ''; let log = ''
    return await new Promise((resolve, reject) => {
      child.stdout?.on('data', data => {
        buffer += data.toString()
        const rows = buffer.split(/\r?\n/); buffer = rows.pop() ?? ''
        const info: Record<string,string> = {}
        for (const row of rows) { const [key,...rest] = row.split('='); if (key) info[key] = rest.join('=') }
        if (info.out_time_us) event.sender.send('job:progress', { id: job.id, percent: duration ? Math.min(100, Number(info.out_time_us) / 1_000_000 / duration * 100) : 0, speed: info.speed ?? '0x', bitrate: info.bitrate ?? '—', totalSize: Number(info.total_size ?? 0) } satisfies FfmpegProgress & { id: string })
      })
      child.stderr?.on('data', data => { log = (log + data.toString()).slice(-16_000) })
      child.on('error', error => { active.delete(job.id); void Promise.allSettled([rm(manifest,{force:true}),rm(partOutput,{force:true})]); reject(error); finishQuitWhenIdle() })
      child.on('close', code => { void (async () => {
        try {
          if (code === 0) { await rename(partOutput, output); resolve({ ok: true, output }) }
          else { await rm(partOutput, { force: true }); reject(new Error(friendlyFfmpegError(log, code))) }
        } catch (error) { await rm(partOutput, { force: true }).catch(() => undefined); reject(error) }
        finally { active.delete(job.id); await rm(manifest, { force: true }).catch(() => undefined); finishQuitWhenIdle() }
      })() })
    })
  })
  ipcMain.handle('media:compress', async (event, input: unknown) => {
    const job = z.object({ id: z.string(), input: localPathSchema, output: localPathSchema, videoKbps: z.number().int().min(100), audioKbps: z.number().int().min(32).max(512), duration: z.number().positive(), start: z.number().nonnegative().optional() }).parse(input)
    const output = unusedOutputPath(job.output)
    const partOutput = createPartPath(output)
    const passlog = path.join(app.getPath('temp'), `ffmpeg-studio-${randomUUID()}`)
    const progressOutput = (data: Buffer, pass: 1 | 2, buffer: string) => {
      buffer += data.toString()
      const rows = buffer.split(/\r?\n/)
      buffer = rows.pop() ?? ''
      const info: Record<string,string> = {}
      for (const row of rows) { const [key,...rest] = row.split('='); if (key) info[key] = rest.join('=') }
      if (info.out_time_us) event.sender.send('job:progress', { id: job.id, percent: (pass === 1 ? 0 : 50) + (job.duration ? Math.min(100, Number(info.out_time_us) / 1_000_000 / job.duration * 100) / 2 : 0), speed: info.speed ?? '0x', bitrate: info.bitrate ?? '—', totalSize: Number(info.total_size ?? 0) } satisfies FfmpegProgress & { id: string })
      return buffer
    }
    const runPass = (pass: 1 | 2) => new Promise<void>((resolve, reject) => {
      const nullOutput = process.platform === 'win32' ? 'NUL' : '/dev/null'
      const outputArgs = pass === 1 ? ['-an','-f','null',nullOutput] : ['-c:a','aac','-b:a',`${job.audioKbps}k`,'-movflags','+faststart',partOutput]
      const trimArgs = job.start === undefined ? [] : ['-ss',String(job.start),'-t',String(job.duration)]
      const child = spawn(locate('ffmpeg'), ['-y',...trimArgs,'-i',job.input,'-c:v','libx264','-b:v',`${job.videoKbps}k`,'-pass',String(pass),'-passlogfile',passlog,...outputArgs,'-progress','pipe:1','-nostats'], { windowsHide: true, stdio: ['pipe','pipe','pipe'] })
      active.set(job.id, child)
      let buffer = ''; let log = ''
      child.stdout?.on('data', data => { buffer = progressOutput(data, pass, buffer) })
      child.stderr?.on('data', data => { log = (log + data.toString()).slice(-16_000) })
      child.on('error', reject)
      child.on('close', code => code === 0 ? resolve() : reject(new Error(friendlyFfmpegError(log, code))))
    })
    try {
      await runPass(1)
      await runPass(2)
      await rename(partOutput, output)
      return { ok: true, output }
    } finally {
      active.delete(job.id)
      await rm(partOutput, { force: true })
      await Promise.allSettled(['', '-0.log', '-0.log.mbtree'].map(suffix => rm(`${passlog}${suffix}`, { force: true })))
      finishQuitWhenIdle()
    }
  })
  ipcMain.handle('job:cancel', (_event, id: unknown) => {
    const jobId = z.string().parse(id); const child = active.get(jobId)
    child?.stdin?.write('q\n'); setTimeout(() => { if (child && active.has(jobId)) child.kill() }, 1500).unref()
  })
  ipcMain.handle('ffmpeg:status', async () => {
    const status = await refreshFfmpegSelection()
    if (!status.available) return { ...status, encoders: [], gpu: [] }
    try {
      const encoderText = await run(status.path, ['-hide_banner', '-encoders'])
      const encoders = ['libx264', 'libx265', 'libsvtav1', 'libvpx-vp9', 'h264_nvenc', 'hevc_nvenc', 'h264_qsv', 'hevc_qsv', 'h264_amf', 'hevc_amf'].filter(name => encoderText.includes(name))
      return { ...status, version: parseFfmpegFiles(await run(status.path, ['-version'])).ffmpeg, encoders, gpu: encoders.filter(name => /nvenc|_qsv|_amf/.test(name)), versions: await readdir(path.join(app.getPath('userData'), 'ffmpeg')).catch(() => []), activeVersion: settings.get('ffmpegVersion') ?? '' }
    } catch { return { ...status, available: false, version: '', encoders: [], gpu: [] } }
  })
  ipcMain.handle('app:reveal', (_event, file: unknown) => { shell.showItemInFolder(localPathSchema.parse(file)) })
  ipcMain.handle('app:open', (_event, file: unknown) => shell.openPath(localPathSchema.parse(file)))
}

async function createWindow() {
  const iconPath = app.isPackaged ? path.join(process.resourcesPath, 'icons', 'icon.png') : path.join(app.getAppPath(), 'build', 'icon.png')
  mainWindow = new BrowserWindow({ width: 1440, height: 920, minWidth: 960, minHeight: 600, backgroundColor: '#0b0d12', title: 'FFmpeg Studio', icon: iconPath, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', event => event.preventDefault())
  if (process.env.VITE_DEV_SERVER_URL) await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else await mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
}

function createTray() {
  const iconPath = app.isPackaged ? path.join(process.resourcesPath, 'icons', 'tray-icon.png') : path.join(app.getAppPath(), 'build', 'tray-icon.png')
  tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.setToolTip('FFmpeg Studio')
  let paused = false
  const show = () => { if (!mainWindow) void createWindow(); else { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus() } }
  const menu = () => Menu.buildFromTemplate([
    { label: 'Показать', click: show },
    { label: paused ? 'Очередь: продолжить' : 'Очередь: пауза', click: () => { paused = !paused; mainWindow?.webContents.send('queue:toggle', paused); tray?.setContextMenu(menu()) } },
    { type: 'separator' },
    { label: 'Выход', click: () => app.quit() },
  ])
  tray.setContextMenu(menu())
  tray.on('double-click', show)
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.frameforge.ffmpegstudio')
  protocol.handle('app-media', request => {
    const file = new URL(request.url).searchParams.get('path')
    if (!file || !mediaPaths.has(path.resolve(file))) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(file).toString())
  })
  registerIpc(); createTray(); void refreshFfmpegSelection().then(() => createWindow())
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
