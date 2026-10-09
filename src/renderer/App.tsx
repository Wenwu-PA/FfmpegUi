import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AudioLines, Check, ChevronDown, ChevronUp, Clapperboard, Clock3, FileAudio2, FileVideo2, FolderOpen, Gauge, History, MoreHorizontal, Play, Plus, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Upload, WandSparkles, X } from 'lucide-react'
import type { MediaFile, ProbeResult } from '../shared/types'
import { buildFfmpegArgs } from '../shared/buildFfmpegArgs'
import { calculateTargetVideoBitrateKbps } from '../shared/targetSize'

type Section = 'converter' | 'merge' | 'queue' | 'history' | 'settings'
type Preset = { id: 'web' | 'telegram' | 'h265' | 'mp3' | 'gif'; title: string; detail: string; extension: string; icon: typeof FileVideo2 }

const presets: Preset[] = [
  { id: 'web', title: 'Для веба', detail: 'MP4 · H.264 · универсальный', extension: 'mp4', icon: Clapperboard },
  { id: 'telegram', title: 'Мессенджеры', detail: 'MP4 · легко отправить', extension: 'mp4', icon: FileVideo2 },
  { id: 'h265', title: 'Компактный', detail: 'MP4 · H.265 · меньше размер', extension: 'mp4', icon: Gauge },
  { id: 'mp3', title: 'Извлечь аудио', detail: 'MP3 · 192 кбит/с', extension: 'mp3', icon: AudioLines },
  { id: 'gif', title: 'Анимированный GIF', detail: 'GIF · 15 кадров/с', extension: 'gif', icon: Sparkles },
]
const nav: { id: Section; title: string; icon: typeof Clapperboard }[] = [
  { id: 'converter', title: 'Конвертер', icon: Clapperboard }, { id: 'merge', title: 'Склейка', icon: Clapperboard }, { id: 'queue', title: 'Очередь', icon: Activity }, { id: 'history', title: 'История', icon: History }, { id: 'settings', title: 'Настройки', icon: Settings2 },
]
const formatSize = (size: number) => size > 1_000_000_000 ? `${(size / 1_000_000_000).toFixed(2)} ГБ` : size > 1_000_000 ? `${(size / 1_000_000).toFixed(1)} МБ` : `${(size / 1000).toFixed(0)} КБ`
const formatTime = (value?: string) => { const seconds = Math.floor(Number(value ?? 0)); return `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${(seconds % 60).toString().padStart(2,'0')}` }
const mediaKind = (probe?: ProbeResult) => probe?.streams.some(stream => stream.codec_type === 'video') ? 'Видео' : probe?.streams.some(stream => stream.codec_type === 'audio') ? 'Аудио' : 'Медиа'
const fileName = (file: string) => file.split(/[\\/]/).at(-1) ?? file
const parseClock = (value: string) => value.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0)

type FfmpegStatus = Awaited<ReturnType<typeof window.ffmpegStudio.ffmpegStatus>>
function FfmpegSettings({ status, onStatus }: { status: FfmpegStatus; onStatus: (status: FfmpegStatus) => void }) {
  const [build, setBuild] = useState<'essentials' | 'full'>('essentials')
  const [channel, setChannel] = useState<'stable' | 'latest'>('stable')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [progress, setProgress] = useState<{ percent: number; received: number; total: number; speed: number; eta: number | null } | null>(null)
  const [proxy, setProxy] = useState('')
  const [selectedVersion, setSelectedVersion] = useState(status.activeVersion ?? '')
  const [message, setMessage] = useState('')
  useEffect(() => {
    void window.ffmpegStudio.getSettings().then(settings => setProxy(settings.proxy ?? ''))
    return window.ffmpegStudio.onFfmpegDownloadProgress(setProgress)
  }, [])
  useEffect(() => setSelectedVersion(status.activeVersion ?? ''), [status.activeVersion])
  const install = async () => {
    setBusy(true); setMessage(''); setFailed(false)
    try { await window.ffmpegStudio.installFfmpeg({ build, channel }); onStatus(await window.ffmpegStudio.ffmpegStatus()); setMessage('FFmpeg установлен и готов к работе.') }
    catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Не удалось установить FFmpeg.') }
    finally { setBusy(false); setProgress(null) }
  }
  const installOffline = async () => {
    setMessage('')
    try { const result = await window.ffmpegStudio.installFfmpegOffline(); if (result) onStatus(await window.ffmpegStudio.ffmpegStatus()) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось установить архив.') }
  }
  const choosePath = async () => {
    setMessage('')
    try { await window.ffmpegStudio.chooseFfmpegPath(); onStatus(await window.ffmpegStudio.ffmpegStatus()) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Путь FFmpeg не прошёл проверку.') }
  }
  const formatBytes = (value: number) => `${(value / 1_048_576).toFixed(1)} МБ`
  return <section className="settings-card"><h2>FFmpeg</h2><p>{status.available ? `Готов · ${status.version} · ${status.source === 'managed' ? 'установлен приложением' : status.source === 'custom' ? 'пользовательский путь' : status.source === 'bundled' ? 'встроенный' : 'системный PATH'}` : 'FFmpeg не найден. Он нужен для работы приложения.'}</p>
    <div className="setting-row"><div className="setting-path"><strong>{status.available ? status.path : 'Не найден'}</strong><span>{status.available ? `Кодеки: ${status.encoders?.join(', ') || 'не определены'} · GPU: ${status.gpu?.join(', ') || 'не обнаружен'}` : 'Другие разделы доступны; обработка включится после установки.'}</span></div><button className="secondary-button" onClick={() => void window.ffmpegStudio.testFfmpeg().then(() => setMessage('Пробная кодировка 1 секунды прошла.')).catch(error => setMessage(error instanceof Error ? error.message : 'Тест завершился ошибкой.'))}>Проверить работоспособность</button></div>
    <div className="setting-row" style={{ marginTop: 14 }}><label className="field">Сборка<select value={build} onChange={event => setBuild(event.target.value as typeof build)}><option value="essentials">Essentials</option><option value="full">Full</option></select></label><label className="field">Версия<select value={channel} onChange={event => setChannel(event.target.value as typeof channel)}><option value="stable">Стабильная</option><option value="latest">Последняя</option></select></label><button className="primary-button" disabled={busy} onClick={() => void install()}>{busy ? 'Скачивание…' : status.available ? 'Скачать / обновить' : 'Скачать автоматически (рекомендуется)'}</button></div>
    {progress && <div className="download-progress"><div className="progress-track"><span style={{ width: `${progress.percent}%` }} /></div><span>{progress.total ? `${progress.percent.toFixed(0)}% · ${formatBytes(progress.received)} / ${formatBytes(progress.total)}` : `${formatBytes(progress.received)} · размер неизвестен`} · {formatBytes(progress.speed)}/с{progress.eta ? ` · ~${Math.ceil(progress.eta)} с` : ''}</span><button className="cancel-button" onClick={() => void window.ffmpegStudio.cancelFfmpegDownload()}>Отмена</button></div>}
    <div className="setting-row" style={{ marginTop: 12 }}><button className="secondary-button" onClick={() => void installOffline()}>Выбрать архив или папку (офлайн)</button><button className="secondary-button" onClick={() => void choosePath()}>Указать путь вручную</button>{status.available && <><button className="secondary-button" onClick={() => void window.ffmpegStudio.reveal(status.path)}>Открыть папку</button><button className="secondary-button" onClick={() => void window.ffmpegStudio.removeFfmpeg().then(() => window.ffmpegStudio.ffmpegStatus()).then(onStatus)}>Удалить скачанную версию</button></>}</div>
    {!!status.versions?.length && <div className="setting-row" style={{ marginTop: 12 }}><label className="field">Установленные версии<select value={selectedVersion} onChange={event => setSelectedVersion(event.target.value)}>{status.versions.map(version => <option value={version} key={version}>{version}</option>)}</select></label><button className="secondary-button" onClick={() => void window.ffmpegStudio.switchFfmpegVersion(selectedVersion).then(() => window.ffmpegStudio.ffmpegStatus()).then(onStatus)}>Использовать выбранную</button></div>}
    <div className="setting-row" style={{ marginTop: 12 }}><label className="field" style={{ flex: 1 }}>Свой прокси<input value={proxy} onChange={event => setProxy(event.target.value)} placeholder="http://127.0.0.1:8080" /></label><button className="secondary-button" onClick={() => void window.ffmpegStudio.setSettings({ proxy })}>Сохранить прокси</button></div>
    {message && <p role="status">{message}</p>}{failed && <button className="secondary-button" disabled={busy} onClick={() => void install()}>Повторить</button>}
  </section>
}

export function App() {
  const [section, setSection] = useState<Section>('converter')
  const [files, setFiles] = useState<MediaFile[]>([])
  const [preset, setPreset] = useState<Preset>(presets[0]!)
  const [targetFormat, setTargetFormat] = useState('mp4')
  const [videoCodec, setVideoCodec] = useState('auto')
  const [trimStart, setTrimStart] = useState('00:00:00')
  const [trimEnd, setTrimEnd] = useState('')
  const [trimMode, setTrimMode] = useState(false)
  const [compressMode, setCompressMode] = useState(false)
  const [targetSizeMB, setTargetSizeMB] = useState('25')
  const [outputDir, setOutputDir] = useState('')
  const [quality, setQuality] = useState(23)
  const [advanced, setAdvanced] = useState(false)
  const [ffmpeg, setFfmpeg] = useState({ available: false, version: '', path: '' })
  const [jobs, setJobs] = useState<{ id: string; name: string; progress: number; status: 'working' | 'done' | 'error' | 'cancelled'; error?: string }[]>([])
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState('')
  const queuePausedRef = useRef(false)

  useEffect(() => {
    void window.ffmpegStudio.getSettings().then(settings => { if (settings.outputDir) setOutputDir(settings.outputDir) })
    void window.ffmpegStudio.ffmpegStatus().then(setFfmpeg)
    const unsubscribeProgress = window.ffmpegStudio.onProgress(progress => setJobs(current => current.map(job => job.id === progress.id ? { ...job, progress: progress.percent } : job)))
    const unsubscribeQueue = window.ffmpegStudio.onQueuePause(paused => { queuePausedRef.current = paused })
    return () => { unsubscribeProgress(); unsubscribeQueue() }
  }, [])

  const outputPath = useMemo(() => outputDir || 'Папка с исходным файлом', [outputDir])
  const addFiles = async (paths: string[]) => {
    const unique = [...new Set(paths)].filter(path => !files.some(file => file.path === path))
    const added = await Promise.all(unique.map(async path => {
      const base: MediaFile = { path, name: fileName(path), size: 0 }
      try {
        const probe = await window.ffmpegStudio.probe(path)
        const size = Number(probe.format.size ?? 0)
        let thumbnail: string | undefined
        if (probe.streams.some(stream => stream.codec_type === 'video')) { try { thumbnail = await window.ffmpegStudio.thumbnail(path) } catch { /* Still show file metadata if no frame can be decoded. */ } }
        return { ...base, size, probe, thumbnail }
      } catch (error) { return { ...base, error: error instanceof Error ? error.message : 'Не удалось прочитать файл' } }
    }))
    setFiles(current => [...current, ...added])
    if (added.length) setSection('converter')
  }
  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault(); setDragging(false)
    void addFiles(Array.from(event.dataTransfer.files).map(file => window.ffmpegStudio.getPathForFile(file)).filter(Boolean))
  }
  const convert = async () => {
    if (!files.length) { setToast('Сначала добавьте медиафайлы'); return }
    if (!ffmpeg.available) { setToast('FFmpeg не найден. Установите его или укажите путь в настройках.'); return }
    if (compressMode && (preset.id === 'mp3' || preset.id === 'gif')) { setToast('Целевой размер доступен для видео. Выберите видеоформат.'); return }
    const trimBegin = trimMode ? parseClock(trimStart) : undefined
    const trimFinish = trimMode && trimEnd ? parseClock(trimEnd) : undefined
    if (trimMode && (trimBegin === undefined || !Number.isFinite(trimBegin) || trimBegin < 0 || (trimFinish !== undefined && (!Number.isFinite(trimFinish) || trimFinish <= trimBegin)))) {
      setToast('Проверьте время начала и конца фрагмента')
      return
    }
    for (const file of files.filter(item => !item.error)) {
      while (queuePausedRef.current) await new Promise(resolve => setTimeout(resolve, 200))
      const id = crypto.randomUUID()
      const extension = compressMode ? 'mp4' : preset.id === 'mp3' || preset.id === 'gif' ? preset.extension : targetFormat
      const stem = file.name.replace(/\.[^.]+$/, '')
      const output = `${outputDir || file.path.replace(/[\\/][^\\/]+$/, '')}/${stem}_${preset.id}.${extension}`
      const duration = Number(file.probe?.format.duration ?? 0)
      const start = trimBegin
      const clipDuration = start !== undefined && trimFinish !== undefined ? trimFinish - start : duration || undefined
      setJobs(current => [{ id, name: file.name, progress: 0, status: 'working' }, ...current])
      try {
        let result: { ok: boolean; output?: string }
        if (compressMode) {
          if (!clipDuration) throw new Error('Файл должен содержать длительность для сжатия до заданного размера')
          const audioKbps = 128
          const videoKbps = calculateTargetVideoBitrateKbps(Number(targetSizeMB), clipDuration, audioKbps)
          result = await window.ffmpegStudio.compress({ id, input: file.path, output, videoKbps, audioKbps, duration: clipDuration, start })
        } else {
          const args = buildFfmpegArgs({ input: file.path, output, format: extension, preset: preset.id, quality, start, duration: clipDuration, videoCodec: videoCodec === 'auto' ? undefined : videoCodec })
          result = await window.ffmpegStudio.convert({ id, input: file.path, output, args: args.slice(0, -1), duration: clipDuration })
        }
        setJobs(current => current.map(job => job.id === id ? { ...job, progress: 100, status: 'done' } : job))
        setToast(`Готово: ${fileName(result.output ?? output)}`)
      } catch (error) {
        setJobs(current => current.map(job => job.id === id ? { ...job, status: job.status === 'cancelled' ? 'cancelled' : 'error', error: job.status === 'cancelled' ? undefined : error instanceof Error ? error.message : 'Ошибка FFmpeg' } : job))
      }
    }
    setSection('queue')
  }
  const mergeFiles = async () => {
    const inputs = files.filter(file => !file.error && file.probe?.streams.some(stream => stream.codec_type === 'video'))
    if (inputs.length < 2) { setToast('Для склейки добавьте минимум два видеофайла'); return }
    const first = inputs[0]!
    const extension = first.name.split('.').at(-1) ?? 'mp4'
    const base = first.name.replace(/\.[^.]+$/, '')
    const output = `${outputDir || first.path.replace(/[\\/][^\\/]+$/, '')}/${base}_merged.${extension}`
    const id = crypto.randomUUID()
    setJobs(current => [{ id, name: `${inputs.length} видеофайла · склейка`, progress: 0, status: 'working' }, ...current])
    try {
      const result = await window.ffmpegStudio.merge({ id, inputs: inputs.map(file => file.path), output })
      setJobs(current => current.map(job => job.id === id ? { ...job, progress: 100, status: 'done' } : job))
      setToast(`Готово: ${fileName(result.output ?? output)}`)
    } catch (error) {
      setJobs(current => current.map(job => job.id === id ? { ...job, status: 'error', error: error instanceof Error ? error.message : 'Ошибка склейки' } : job))
    }
    setSection('queue')
  }

  return <div className="app-shell" onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false) }} onDrop={handleDrop}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Clapperboard size={20} strokeWidth={2.2} /></div><div><div className="brand-name">FFmpeg <span>Studio</span></div><div className="brand-caption">VIDEO WORKSPACE</div></div></div>
      <div className="workspace-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav className="nav-list">{nav.map(item => <button key={item.id} className={`nav-item ${section === item.id ? 'active' : ''}`} onClick={() => setSection(item.id)}><item.icon size={17} /><span>{item.title}</span>{item.id === 'queue' && jobs.some(job => job.status === 'working') && <span className="nav-count">{jobs.filter(job => job.status === 'working').length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="engine-card"><div className={`engine-dot ${ffmpeg.available ? 'ready' : ''}`} /><div><strong>{ffmpeg.available ? 'FFmpeg готов' : 'FFmpeg не найден'}</strong><span>{ffmpeg.available ? ffmpeg.version.replace('ffmpeg version ', 'версия ') : 'укажите путь в настройках'}</span></div><MoreHorizontal size={15} /></div><div className="user-card"><div className="avatar">WS</div><div><strong>Локальная сессия</strong><span>Обработка на устройстве</span></div><ShieldCheck size={15} className="shield" /></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Пространство</span><span className="crumb-sep">/</span><strong>{nav.find(item => item.id === section)?.title}</strong></div><div className="top-actions"><div className="privacy-badge"><span /> Всё остаётся на устройстве</div><div className="top-avatar" aria-label="Локальная сессия">W</div></div></header>
      <div className="content-scroll">
        {section === 'converter' && <>
          <section className="page-heading"><div><div className="eyebrow"><WandSparkles size={13} /> МЕДИА-ИНСТРУМЕНТАРИЙ</div><h1>Конвертер</h1><p>Преобразуйте видео и аудио в несколько кликов.</p></div><button className={`mode-toggle ${advanced ? 'on' : ''}`} onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={15} /> Расширенный режим <span className="toggle-dot" /></button></section>
          {!ffmpeg.available && <div className="notice"><div className="notice-symbol">!</div><div><strong>FFmpeg не найден. Он нужен для работы приложения.</strong><span>Выберите рекомендуемую установку, путь к программе или готовый архив.</span></div><button onClick={() => { void window.ffmpegStudio.installFfmpeg({ build: 'essentials', channel: 'stable' }).then(() => window.ffmpegStudio.ffmpegStatus()).then(setFfmpeg).catch(error => setToast(error instanceof Error ? error.message : 'Не удалось скачать FFmpeg.')) }}>Скачать автоматически</button><button onClick={() => { void window.ffmpegStudio.chooseFfmpegPath().then(() => window.ffmpegStudio.ffmpegStatus()).then(setFfmpeg).catch(error => setToast(error instanceof Error ? error.message : 'Путь FFmpeg не прошёл проверку.')) }}>Указать путь вручную</button><button onClick={() => { void window.ffmpegStudio.installFfmpegOffline().then(() => window.ffmpegStudio.ffmpegStatus()).then(setFfmpeg).catch(error => setToast(error instanceof Error ? error.message : 'Не удалось установить архив.')) }}>Выбрать архив (офлайн)</button></div>}
          <section className={`dropzone ${dragging ? 'dragging' : ''} ${files.length ? 'compact' : ''}`} onClick={() => void window.ffmpegStudio.chooseFiles().then(addFiles)} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') void window.ffmpegStudio.chooseFiles().then(addFiles) }}><div className="upload-icon"><Upload size={21} /></div><div className="drop-copy"><strong>{files.length ? 'Добавьте ещё файлы' : 'Перетащите файлы сюда'}</strong><span>Видео, аудио и изображения <i>·</i> до 20 ГБ на файл</span></div><button className="secondary-button" onClick={event => { event.stopPropagation(); void window.ffmpegStudio.chooseFiles().then(addFiles) }}><Plus size={15} /> Выбрать файлы</button></section>
          {files.length > 0 && <section className="source-section"><div className="section-header"><div><h2>Исходные файлы <span className="count-pill">{files.length}</span></h2><p>Файлы готовы к обработке</p></div><button className="subtle-button" onClick={() => setFiles([])}><Trash2 size={14} /> Очистить список</button></div><div className="file-list">{files.map(file => {
            const video = file.probe?.streams.find(stream => stream.codec_type === 'video')
            return <article className="file-card" key={file.path}><div className="file-preview">{file.thumbnail ? <img src={file.thumbnail} alt="" /> : <div className="file-glyph">{mediaKind(file.probe) === 'Аудио' ? <FileAudio2 size={20} /> : <FileVideo2 size={20} />}</div>}<span className="duration">{formatTime(file.probe?.format.duration)}</span></div><div className="file-info"><strong title={file.name}>{file.name}</strong><span>{file.error ? 'Ошибка чтения' : `${mediaKind(file.probe)} · ${file.probe?.format.format_name?.split(',')[0]?.toUpperCase() ?? 'файл'}`}</span><div className="file-meta">{video ? `${video.width} × ${video.height}` : file.probe?.streams[0]?.codec_name ?? '—'} <i>·</i> {formatSize(file.size)}</div></div><div className="file-status"><span className={file.error ? 'status-bad' : ''}>{file.error ? 'Ошибка' : 'Готов'}</span><button className="small-icon" aria-label="Удалить файл" onClick={() => setFiles(current => current.filter(item => item.path !== file.path))}><X size={15} /></button></div></article>
          })}</div></section>}
          <section className="preset-section"><div className="section-header"><div><h2>Формат результата</h2><p>Выберите готовый вариант или настройте параметры вручную</p></div><button className="text-link" onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={14} /> Настроить</button></div><div className="preset-grid">{presets.map(item => <button key={item.id} className={`preset-card ${preset.id === item.id ? 'selected' : ''}`} onClick={() => setPreset(item)}><div className="preset-icon"><item.icon size={18} /></div><div className="preset-copy"><strong>{item.title}</strong><span>{item.detail}</span></div><span className="radio-mark">{preset.id === item.id && <Check size={11} />}</span></button>)}</div>
            {advanced && <div className="advanced-panel"><div className="field"><label htmlFor="quality">Качество <span>CRF {quality}</span></label><input id="quality" type="range" min="18" max="32" value={quality} onChange={event => setQuality(Number(event.target.value))} /><div className="range-labels"><span>Высокое</span><span>Меньший файл</span></div></div><div className="field"><label>Контейнер</label><div className="select-wrap"><select value={targetFormat} onChange={event => { setTargetFormat(event.target.value); setVideoCodec('auto') }}><option value="mp4">MP4</option><option value="mkv">MKV</option><option value="webm">WebM</option><option value="mov">MOV</option><option value="avi">AVI</option></select><ChevronDown size={14} /></div></div><div className="field"><label>Видеокодек</label><div className="select-wrap"><select value={videoCodec} onChange={event => setVideoCodec(event.target.value)}><option value="auto">Автоматически</option>{targetFormat === 'webm' ? <option value="libvpx-vp9">VP9</option> : targetFormat === 'avi' ? <option value="mpeg4">MPEG-4</option> : <><option value="libx264">H.264</option><option value="libx265">H.265</option></>}<option value="copy">Копировать поток</option></select><ChevronDown size={14} /></div></div></div>}
            <div className="trim-tools"><label className="trim-switch"><input type="checkbox" checked={trimMode} onChange={event => setTrimMode(event.target.checked)} /> Обрезать фрагмент</label>{trimMode && <div className="trim-times"><label>Начало <input aria-label="Начало" value={trimStart} onChange={event => setTrimStart(event.target.value)} placeholder="ЧЧ:ММ:СС" /></label><label>Конец <input aria-label="Конец" value={trimEnd} onChange={event => setTrimEnd(event.target.value)} placeholder="ЧЧ:ММ:СС" /></label><span>Точная обрезка с перекодированием</span></div>}</div>
            <div className="trim-tools"><label className="trim-switch"><input type="checkbox" checked={compressMode} onChange={event => setCompressMode(event.target.checked)} /> Сжать до нужного размера</label>{compressMode && <div className="trim-times"><label>Размер, МБ <input aria-label="Целевой размер в мегабайтах" type="number" min="1" max="4096" value={targetSizeMB} onChange={event => setTargetSizeMB(event.target.value)} /></label><span>MP4 · H.264 · двухпроходное кодирование</span></div>}</div>
          </section>
          <section className="output-section"><div className="output-label"><FolderOpen size={16} /><div><strong>Папка сохранения</strong><span title={outputPath}>{outputDir || 'Рядом с исходным файлом'}</span></div></div><button className="secondary-button browse-button" onClick={() => void window.ffmpegStudio.chooseDirectory().then(path => { if (path) { setOutputDir(path); void window.ffmpegStudio.setSettings({ outputDir: path }) } })}>Обзор <ChevronDown size={14} /></button></section>
          <footer className="convert-footer"><div className="footer-note"><ShieldCheck size={15} /><span>Обработка выполняется локально на вашем устройстве</span></div><button className="primary-button" onClick={() => void convert()}><Play size={15} fill="currentColor" /> Конвертировать <span className="button-count">{files.length || 0}</span></button></footer>
        </>}
        {section === 'merge' && <><section className="page-heading"><div><div className="eyebrow"><Clapperboard size={13} /> ВИДЕО-МОНТАЖ</div><h1>Склейка видео</h1><p>Объедините видео с одинаковыми кодеками, разрешением и частотой кадров.</p></div><button className="secondary-button" onClick={() => void window.ffmpegStudio.chooseFiles().then(addFiles)}><Plus size={15} /> Добавить видео</button></section><div className="merge-list">{files.filter(file => !file.error && file.probe?.streams.some(stream => stream.codec_type === 'video')).map((file, index, items) => <article className="merge-item" key={file.path}><span className="merge-index">{index + 1}</span><div className="merge-file"><strong>{file.name}</strong><span>{file.probe?.streams.find(stream => stream.codec_type === 'video')?.codec_name} · {file.probe?.streams.find(stream => stream.codec_type === 'video')?.width} × {file.probe?.streams.find(stream => stream.codec_type === 'video')?.height} · {formatTime(file.probe?.format.duration)}</span></div><button className="small-icon" aria-label="Переместить выше" disabled={index === 0} onClick={() => setFiles(current => { const videoFiles = current.filter(item => item.probe?.streams.some(stream => stream.codec_type === 'video')); const [moved] = videoFiles.splice(index, 1); videoFiles.splice(index - 1, 0, moved!); return [...videoFiles, ...current.filter(item => !item.probe?.streams.some(stream => stream.codec_type === 'video'))] })}><ChevronUp size={15} /></button><button className="small-icon" aria-label="Переместить ниже" disabled={index === items.length - 1} onClick={() => setFiles(current => { const videoFiles = current.filter(item => item.probe?.streams.some(stream => stream.codec_type === 'video')); const [moved] = videoFiles.splice(index, 1); videoFiles.splice(index + 1, 0, moved!); return [...videoFiles, ...current.filter(item => !item.probe?.streams.some(stream => stream.codec_type === 'video'))] })}><ChevronDown size={15} /></button></article>)}</div><div className="merge-hint"><ShieldCheck size={16} /><span>Быстрая склейка без перекодирования. Все клипы должны иметь совместимые параметры потоков.</span></div><button className="primary-button" disabled={files.filter(file => file.probe?.streams.some(stream => stream.codec_type === 'video')).length < 2 || !ffmpeg.available} onClick={() => void mergeFiles()}><Play size={15} fill="currentColor" /> Склеить видео</button></>}
        {section === 'queue' && <><section className="page-heading"><div><div className="eyebrow"><Activity size={13} /> ПРОЦЕССЫ</div><h1>Очередь задач</h1><p>Следите за ходом обработки файлов.</p></div><button className="secondary-button" onClick={() => setSection('converter')}><Plus size={15} /> Новая задача</button></section>{jobs.length ? <div className="jobs-list">{jobs.map(job => <article className="job-card" key={job.id}><div className="job-icon">{job.status === 'done' ? <Check size={18} /> : job.status === 'error' || job.status === 'cancelled' ? <X size={18} /> : <Clapperboard size={18} />}</div><div className="job-body"><div className="job-title"><strong>{job.name}</strong><span>{job.status === 'working' ? 'Обработка' : job.status === 'done' ? 'Готово' : job.status === 'cancelled' ? 'Отменено' : 'Ошибка'}</span></div>{job.error && <p className="job-error">{job.error}</p>}<div className="progress-track"><span style={{ width: `${job.progress}%` }} /></div><div className="job-caption"><span>{Math.floor(job.progress)}% выполнено</span>{job.status === 'working' ? <button className="cancel-button" onClick={() => { setJobs(current => current.map(item => item.id === job.id ? { ...item, status: 'cancelled' } : item)); void window.ffmpegStudio.cancel(job.id) }}>Отменить</button> : <span />}</div></div></article>)}</div> : <div className="empty-state"><div className="empty-icon"><Activity size={24} /></div><h3>Очередь пока пуста</h3><p>Добавьте файлы в конвертер, чтобы начать обработку.</p><button className="primary-button" onClick={() => setSection('converter')}><Plus size={15} /> Добавить файлы</button></div>}</>}
        {section === 'history' && <><section className="page-heading"><div><div className="eyebrow"><History size={13} /> НЕДАВНИЕ ФАЙЛЫ</div><h1>История</h1><p>Недавние задачи этой сессии.</p></div></section><div className="empty-state"><div className="empty-icon"><Clock3 size={24} /></div><h3>Здесь появятся завершённые задачи</h3><p>История между перезапусками пока не сохраняется.</p></div></>}
        {section === 'settings' && <><section className="page-heading"><div><div className="eyebrow"><Settings2 size={13} /> ПРИЛОЖЕНИЕ</div><h1>Настройки</h1><p>Пути к инструментам и параметры обработки.</p></div></section><FfmpegSettings status={ffmpeg} onStatus={setFfmpeg} /><section className="settings-card"><h2>Папка вывода по умолчанию</h2><p>Можно заменить для каждой задачи отдельно.</p><div className="setting-row"><div className="setting-path"><strong>{outputDir || 'Рядом с исходным файлом'}</strong></div><button className="secondary-button" onClick={() => void window.ffmpegStudio.chooseDirectory().then(path => { if (path) { setOutputDir(path); void window.ffmpegStudio.setSettings({ outputDir: path }) } })}>Выбрать папку</button></div></section><div className="privacy-note"><ShieldCheck size={18} /><span><strong>Конфиденциальность по умолчанию</strong>Файлы обрабатываются локально. Приложение не отправляет телеметрию.</span></div></>}
      </div>
    </main>
    {dragging && <div className="drag-overlay"><div><Upload size={34} /><strong>Отпустите файлы, чтобы добавить</strong><span>Видео, аудио или изображения</span></div></div>}
    {toast && <div className="toast"><Check size={15} />{toast}<button onClick={() => setToast('')} aria-label="Закрыть"><X size={14} /></button></div>}
  </div>
}
