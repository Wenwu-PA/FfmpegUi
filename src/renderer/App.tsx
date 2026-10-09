import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AudioLines, Check, ChevronDown, ChevronUp, Clapperboard, Clock3, FileAudio2, FileVideo2, FolderOpen, Gauge, History, MoreHorizontal, Play, Plus, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Upload, WandSparkles, X } from 'lucide-react'
import type { MediaFile, ProbeResult } from '../shared/types'
import { buildFfmpegArgs } from '../shared/buildFfmpegArgs'
import { calculateTargetVideoBitrateKbps } from '../shared/targetSize'
import { appearanceSchema, defaultAppearance, palettes, paletteNames, readableAccentText, type Appearance } from '../shared/appearance'
import faviconUrl from './favicon.png'

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
function applyAppearance(value: Appearance) {
  const dark = value.theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : value.theme === 'dark'
  const preset = palettes[value.palette]
  const source = value.palette === 'custom' ? value.colors : preset.colors
  const colors = dark ? source : { ...source, background: '#f1f3f6', surface: '#ffffff', border: '#d5dbe3', text: '#202632', muted: '#596474' }
  const root = document.documentElement
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.background = value.background
  root.dataset.density = value.density
  root.dataset.animations = String(value.animations && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  root.dataset.sidebarPosition = value.sidebarPosition
  root.style.setProperty('--bg', colors.background)
  root.style.setProperty('--panel', colors.surface)
  root.style.setProperty('--surface', colors.surface)
  root.style.setProperty('--line', colors.border)
  root.style.setProperty('--muted', colors.muted)
  root.style.setProperty('--success', colors.success)
  root.style.setProperty('--error', colors.error)
  root.style.setProperty('--warning', colors.warning)
  root.style.setProperty('--text', colors.text)
  root.style.setProperty('--accent', value.accent)
  root.style.setProperty('--accent-text', readableAccentText(value.accent))
  root.style.setProperty('--radius', `${value.radius}px`)
  root.style.setProperty('--ui-scale', String(value.scale))
  root.style.setProperty('--border-width', `${value.borderWidth}px`)
  root.style.setProperty('--shadow-strength', String(value.shadowStrength / 100))
  root.style.setProperty('--glass-alpha', `${value.glassOpacity}%`)
  root.style.setProperty('--glass-blur', `${value.glassBlur}px`)
  root.style.setProperty('--app-bg-image', value.backgroundImage ? `url("${value.backgroundImage}")` : 'none')
  root.style.setProperty('--background-dim', String(0.8 - value.glassOpacity / 100 * 0.65))
  root.style.setProperty('--ui-font', value.font === 'system' ? '"Segoe UI", system-ui, sans-serif' : value.font === 'inter' ? 'Inter, "Segoe UI", sans-serif' : value.font === 'aptos' ? 'Aptos, "Segoe UI", sans-serif' : 'Arial, sans-serif')
  root.style.setProperty('--mono-font', value.monoFont === 'consolas' ? 'Consolas, monospace' : value.monoFont === 'cascadia' ? '"Cascadia Code", Consolas, monospace' : 'ui-monospace, Consolas, monospace')
  root.style.setProperty('--animation-duration', value.animationSpeed === 'slow' ? '0.45s' : value.animationSpeed === 'fast' ? '0.12s' : '0.25s')
}

function AppearanceSettings({ value, onChange }: { value: Appearance; onChange: (value: Appearance) => void }) {
  const [profiles, setProfiles] = useState<{ name: string; appearance: Appearance }[]>([])
  const [profileName, setProfileName] = useState('Мой профиль')
  const [notice, setNotice] = useState('')
  useEffect(() => { void window.ffmpegStudio.getSettings().then(settings => setProfiles(settings.appearanceProfiles ?? [])) }, [])
  const update = (patch: Partial<Appearance>) => onChange(appearanceSchema.parse({ ...value, ...patch }))
  const updateColor = (key: keyof Appearance['colors'], color: string) => update({ palette: 'custom', colors: { ...value.colors, [key]: color } })
  const updateHotkey = (key: keyof Appearance['hotkeys'], shortcut: string) => {
    if (Object.entries(value.hotkeys).some(([other, current]) => other !== key && current.toLowerCase() === shortcut.toLowerCase())) { setNotice('Эта комбинация уже назначена другому действию.'); return }
    update({ hotkeys: { ...value.hotkeys, [key]: shortcut } }); setNotice('')
  }
  const exportTheme = () => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
    link.download = 'ffmpeg-studio-theme.json'; link.click(); URL.revokeObjectURL(link.href)
  }
  const importTheme = async (file?: File) => {
    if (!file) return
    try { const parsed = appearanceSchema.safeParse(JSON.parse(await file.text())); if (!parsed.success) throw new Error('Файл не соответствует схеме темы.'); onChange(parsed.data); setNotice('Оформление импортировано.') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Не удалось прочитать тему.') }
  }
  const saveProfile = async () => {
    const next = [...profiles.filter(profile => profile.name !== profileName.trim()), { name: profileName.trim(), appearance: value }].slice(-20)
    setProfiles(next); await window.ffmpegStudio.setSettings({ appearanceProfiles: next }); setNotice('Профиль оформления сохранён.')
  }
  const colors: [keyof Appearance['colors'], string][] = [['background','Фон'], ['surface','Поверхность'], ['border','Границы'], ['text','Текст'], ['muted','Вторичный текст'], ['success','Успех'], ['error','Ошибка'], ['warning','Предупреждение']]
  return <section className="settings-card appearance-settings"><h2>Оформление</h2><p>Изменения применяются сразу и сохраняются автоматически.</p>
    <div className="setting-row"><label className="field">Режим темы<select value={value.theme} onChange={event => update({ theme: event.target.value as Appearance['theme'] })}><option value="system">Системная</option><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label><label className="field">Готовая палитра<select value={value.palette} onChange={event => { const palette = event.target.value as Appearance['palette']; update({ palette, colors: palettes[palette].colors, accent: palettes[palette].accent }) }}>{Object.entries(paletteNames).map(([id,name]) => <option value={id} key={id}>{name}</option>)}<option value="custom">Своя тема</option></select></label></div>
    <div className="palette-swatches">{Object.entries(paletteNames).map(([id,name]) => <button key={id} className={`palette-swatch ${value.palette === id ? 'selected' : ''}`} title={name} style={{ background: palettes[id as keyof typeof palettes].accent }} onClick={() => update({ palette: id as Appearance['palette'], colors: palettes[id as keyof typeof palettes].colors, accent: palettes[id as keyof typeof palettes].accent })} />)}</div>
    <div className="setting-row"><label className="field">Акцентный цвет<input type="color" value={value.accent} onChange={event => update({ palette: 'custom', accent: event.target.value })} /></label><label className="field">HEX<input value={value.accent} onChange={event => { if (/^#[\da-f]{6}$/i.test(event.target.value)) update({ palette: 'custom', accent: event.target.value }) }} /></label><span className="contrast-preview" style={{ background: value.accent, color: readableAccentText(value.accent) }}>Текст с проверенным контрастом</span></div>
    <details className="appearance-details"><summary>Цвета своей темы</summary><div className="color-editor">{colors.map(([key,label]) => <label key={key}>{label}<input type="color" value={value.colors[key]} onChange={event => updateColor(key,event.target.value)} /></label>)}</div></details>
    <div className="setting-row"><label className="field">Фон приложения<select value={value.background} onChange={event => update({ background: event.target.value as Appearance['background'] })}><option value="solid">Сплошной</option><option value="gradient">Градиент</option><option value="glass">Стекло</option><option value="image">Своя картинка</option><option value="mica">Mica (Windows 11)</option><option value="acrylic">Acrylic (Windows 11)</option></select></label>{value.background === 'image' && <button className="secondary-button" onClick={() => void window.ffmpegStudio.chooseBackgroundImage().then(image => { if (image) { update({ backgroundImage: image }); setNotice('Фон сохранён в папке данных приложения.') } }).catch(error => setNotice(error instanceof Error ? error.message : 'Не удалось сохранить изображение.'))}>Выбрать изображение</button>}</div>
    {value.background === 'image' && value.backgroundImage && <div className="background-preview"><img src={value.backgroundImage} alt="Предпросмотр фона" onError={() => { update({ background: 'gradient', backgroundImage: undefined }); setNotice('Изображение недоступно. Возвращён градиент.') }} /><button className="secondary-button" onClick={() => { update({ background: 'gradient', backgroundImage: undefined }); setNotice('Картинка убрана. Используется градиент.') }}>Убрать картинку</button></div>}
    {(value.background === 'glass' || value.background === 'image') && <div className="setting-row"><label className="field">Прозрачность<input type="range" min="20" max="100" value={value.glassOpacity} onChange={event => update({ glassOpacity: Number(event.target.value) })} /></label><label className="field">Размытие<input type="range" min="0" max="32" value={value.glassBlur} onChange={event => update({ glassBlur: Number(event.target.value) })} /></label></div>}
    <div className="setting-row appearance-sliders"><label className="field">Скругление: {value.radius}px<input type="range" min="0" max="24" value={value.radius} onChange={event => update({ radius: Number(event.target.value) })} /></label><label className="field">Границы: {value.borderWidth}px<input type="range" min="0" max="2" step="0.5" value={value.borderWidth} onChange={event => update({ borderWidth: Number(event.target.value) })} /></label><label className="field">Тени: {value.shadowStrength}%<input type="range" min="0" max="100" value={value.shadowStrength} onChange={event => update({ shadowStrength: Number(event.target.value) })} /></label></div>
    <div className="setting-row"><label className="field">Плотность<select value={value.density} onChange={event => update({ density: event.target.value as Appearance['density'] })}><option value="compact">Компактная</option><option value="normal">Обычная</option><option value="spacious">Свободная</option></select></label><label className="field">Шрифт<select value={value.font} onChange={event => update({ font: event.target.value as Appearance['font'] })}><option value="system">Системный</option><option value="inter">Inter</option><option value="aptos">Aptos</option><option value="arial">Arial</option></select></label><label className="field">Моноширинный<select value={value.monoFont} onChange={event => update({ monoFont: event.target.value as Appearance['monoFont'] })}><option value="system">Системный</option><option value="consolas">Consolas</option><option value="cascadia">Cascadia Code</option></select></label><label className="field">Масштаб: {Math.round(value.scale * 100)}%<input type="range" min="80" max="150" value={Math.round(value.scale * 100)} onChange={event => update({ scale: Number(event.target.value) / 100 })} /></label></div>
    <div className="setting-row"><label className="field">Панель навигации<select value={value.sidebarPosition} onChange={event => update({ sidebarPosition: event.target.value as Appearance['sidebarPosition'] })}><option value="left">Слева</option><option value="right">Справа</option></select></label><label><input type="checkbox" checked={value.sidebarCollapsed} onChange={event => update({ sidebarCollapsed: event.target.checked })} /> Свёрнутая панель</label><label><input type="checkbox" checked={value.sidebarLabels} onChange={event => update({ sidebarLabels: event.target.checked })} /> Подписи разделов</label></div>
    <details className="appearance-details"><summary>Разделы боковой панели</summary><p>Перетаскивайте разделы в панели для изменения порядка.</p><div className="setting-row">{nav.map(item => <label key={item.id}><input type="checkbox" checked={!value.hiddenSections.includes(item.id)} onChange={event => update({ hiddenSections: event.target.checked ? value.hiddenSections.filter(id => id !== item.id) : [...value.hiddenSections, item.id] })} /> {item.title}</label>)}</div></details>
    <div className="setting-row"><label><input type="checkbox" checked={value.animations} onChange={event => update({ animations: event.target.checked })} /> Анимации</label><label className="field">Скорость анимации<select value={value.animationSpeed} onChange={event => update({ animationSpeed: event.target.value as Appearance['animationSpeed'] })}><option value="slow">Медленно</option><option value="normal">Обычная</option><option value="fast">Быстро</option></select></label><label><input type="checkbox" checked={value.alwaysOnTop} onChange={event => update({ alwaysOnTop: event.target.checked })} /> Поверх окон</label><label><input type="checkbox" checked={value.minimizeToTray} onChange={event => update({ minimizeToTray: event.target.checked })} /> Сворачивать в трей</label><label><input type="checkbox" checked={value.startMinimized} onChange={event => update({ startMinimized: event.target.checked })} /> Запускать свёрнутым</label><label><input type="checkbox" checked={value.rememberWindow} onChange={event => update({ rememberWindow: event.target.checked })} /> Запоминать окно</label></div>
    <details className="appearance-details"><summary>Горячие клавиши</summary><div className="setting-row">{(['convert','open','settings'] as const).map(key => <label key={key} className="field">{{ convert: 'Запуск', open: 'Добавить файлы', settings: 'Настройки' }[key]}<input value={value.hotkeys[key]} onChange={event => updateHotkey(key,event.target.value)} /></label>)}</div><small>Не назначайте одну комбинацию двум действиям. Например: Ctrl+Enter, Ctrl+O, Ctrl+,.</small></details>
    <div className="setting-row profile-row"><input value={profileName} onChange={event => setProfileName(event.target.value)} aria-label="Имя профиля" /><button className="secondary-button" onClick={() => void saveProfile()}>Сохранить профиль</button><select value="" onChange={event => { const profile = profiles.find(item => item.name === event.target.value); if (profile) onChange(profile.appearance) }}><option value="" disabled>Выбрать профиль…</option>{profiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name}</option>)}</select></div>
    <div className="setting-row"><button className="secondary-button" onClick={exportTheme}>Экспорт JSON</button><label className="secondary-button import-theme">Импорт JSON<input type="file" accept="application/json,.json" onChange={event => void importTheme(event.target.files?.[0])} /></label><button className="secondary-button" onClick={() => { if (window.confirm('Сбросить все параметры оформления?')) onChange(defaultAppearance) }}>Сбросить всё оформление</button></div>
    <div className="appearance-preview"><strong>Предпросмотр</strong><span>Текст · вторичный текст</span><button className="primary-button">Акцент</button><span className="engine-dot ready" /></div>
    {notice && <p role="status">{notice}</p>}
  </section>
}

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

function AboutSettings() {
  const [info, setInfo] = useState<{ version: string; license: string; ffmpegLicense: string } | null>(null)
  useEffect(() => { void window.ffmpegStudio.appInfo().then(setInfo) }, [])
  return <section className="settings-card about-settings"><h2>О программе</h2><div className="about-mark"><img src={faviconUrl} alt="Логотип FFmpeg Studio" /><div><strong>FFmpeg Studio</strong><span>Версия {info?.version ?? '…'}</span></div></div><p>Лицензия приложения: {info?.license ?? 'MIT'}.</p><p>{info?.ffmpegLicense}</p><button className="secondary-button" onClick={() => void window.ffmpegStudio.openRepository()}>Открыть репозиторий</button></section>
}

export function App() {
  const [section, setSection] = useState<Section>('converter')
  const [appearance, setAppearance] = useState<Appearance>(defaultAppearance)
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

  const changeAppearance = (value: Appearance) => {
    setAppearance(value); applyAppearance(value)
    void window.ffmpegStudio.setSettings({ appearance: value }).catch(error => setToast(error instanceof Error ? error.message : 'Не удалось сохранить оформление.'))
  }

  useEffect(() => {
    void window.ffmpegStudio.getSettings().then(settings => { if (settings.outputDir) setOutputDir(settings.outputDir); if (settings.appearance) { setAppearance(settings.appearance); applyAppearance(settings.appearance) } if (settings.backgroundWarning) setToast(settings.backgroundWarning) })
    void window.ffmpegStudio.ffmpegStatus().then(setFfmpeg)
    const unsubscribeProgress = window.ffmpegStudio.onProgress(progress => setJobs(current => current.map(job => job.id === progress.id ? { ...job, progress: progress.percent } : job)))
    const unsubscribeQueue = window.ffmpegStudio.onQueuePause(paused => { queuePausedRef.current = paused })
    return () => { unsubscribeProgress(); unsubscribeQueue() }
  }, [])
  useEffect(() => {
    const listener = () => applyAppearance(appearance)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [appearance])
  useEffect(() => {
    if (appearance.hiddenSections.includes(section)) setSection(appearance.sidebarSections.find(id => !appearance.hiddenSections.includes(id)) ?? 'converter')
  }, [appearance.hiddenSections, appearance.sidebarSections, section])

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

  const hotkeyActions = useRef({ convert, addFiles })
  hotkeyActions.current = { convert, addFiles }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const combo = `${event.ctrlKey || event.metaKey ? 'Ctrl+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.altKey ? 'Alt+' : ''}${event.key === 'Enter' ? 'Enter' : event.key.toUpperCase()}`
      const configured = appearance.hotkeys
      if (combo.toLowerCase() === configured.convert.toLowerCase()) { event.preventDefault(); void hotkeyActions.current.convert() }
      else if (combo.toLowerCase() === configured.open.toLowerCase()) { event.preventDefault(); void window.ffmpegStudio.chooseFiles().then(hotkeyActions.current.addFiles) }
      else if (combo.toLowerCase() === configured.settings.toLowerCase()) { event.preventDefault(); setSection('settings') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [appearance.hotkeys])

  return <div className={`app-shell ${appearance.sidebarCollapsed ? 'sidebar-collapsed' : ''}`} data-sidebar-position={appearance.sidebarPosition} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false) }} onDrop={handleDrop}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Clapperboard size={20} strokeWidth={2.2} /></div><div><div className="brand-name">FFmpeg <span>Studio</span></div><div className="brand-caption">VIDEO WORKSPACE</div></div></div>
      <div className="workspace-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav className="nav-list">{appearance.sidebarSections.filter(id => !appearance.hiddenSections.includes(id)).map(id => nav.find(item => item.id === id)!).map(item => <button key={item.id} draggable title={item.title} className={`nav-item ${section === item.id ? 'active' : ''}`} onDragStart={event => event.dataTransfer.setData('text/sidebar-section', item.id)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); event.stopPropagation(); const from = event.dataTransfer.getData('text/sidebar-section') as Section; const order = [...appearance.sidebarSections]; const oldIndex = order.indexOf(from); const newIndex = order.indexOf(item.id); if (oldIndex >= 0 && newIndex >= 0) { order.splice(oldIndex, 1); order.splice(newIndex, 0, from); changeAppearance({ ...appearance, sidebarSections: order }) } }} onClick={() => setSection(item.id)}><item.icon size={17} />{appearance.sidebarLabels && <span>{item.title}</span>}{item.id === 'queue' && jobs.some(job => job.status === 'working') && <span className="nav-count">{jobs.filter(job => job.status === 'working').length}</span>}</button>)}</nav>
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
        {section === 'settings' && <><section className="page-heading"><div><div className="eyebrow"><Settings2 size={13} /> ПРИЛОЖЕНИЕ</div><h1>Настройки</h1><p>Пути к инструментам и параметры обработки.</p></div></section><AppearanceSettings value={appearance} onChange={changeAppearance} /><FfmpegSettings status={ffmpeg} onStatus={setFfmpeg} /><section className="settings-card"><h2>Папка вывода по умолчанию</h2><p>Можно заменить для каждой задачи отдельно.</p><div className="setting-row"><div className="setting-path"><strong>{outputDir || 'Рядом с исходным файлом'}</strong></div><button className="secondary-button" onClick={() => void window.ffmpegStudio.chooseDirectory().then(path => { if (path) { setOutputDir(path); void window.ffmpegStudio.setSettings({ outputDir: path }) } })}>Выбрать папку</button></div></section><div className="privacy-note"><ShieldCheck size={18} /><span><strong>Конфиденциальность по умолчанию</strong>Файлы обрабатываются локально. Приложение не отправляет телеметрию.</span></div><AboutSettings /></>}
      </div>
    </main>
    {dragging && <div className="drag-overlay"><div><Upload size={34} /><strong>Отпустите файлы, чтобы добавить</strong><span>Видео, аудио или изображения</span></div></div>}
    {toast && <div className="toast"><Check size={15} />{toast}<button onClick={() => setToast('')} aria-label="Закрыть"><X size={14} /></button></div>}
  </div>
}
