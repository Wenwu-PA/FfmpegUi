import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Activity, AudioLines, Check, ChevronDown, ChevronUp, Clapperboard, Clock3, FileAudio2, FileVideo2, FolderOpen, Gauge, History, MoreHorizontal, Play, Plus, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Upload, WandSparkles, X } from 'lucide-react'
import type { MediaFile, ProbeResult } from '../shared/types'
import { buildFfmpegArgs } from '../shared/buildFfmpegArgs'
import { codecById, codecRegistry, codecsOfType, defaultAudioCodecForContainer, defaultVideoCodecForContainer, isCodecContainerCompatible, type QualityMode } from '../shared/codecs'
import { calculateTargetVideoBitrateKbps } from '../shared/targetSize'
import { appearanceColorTokens, appearanceSchema, defaultAppearance, palettes, paletteNames, readableAccentText, type Appearance } from '../shared/appearance'
import { t as translate, type Language } from '../shared/i18n'
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
const formatSize = (size: number, language: Language) => size > 1_000_000_000 ? `${(size / 1_000_000_000).toFixed(2)} ${translate('ГБ', language)}` : size > 1_000_000 ? `${(size / 1_000_000).toFixed(1)} ${translate('МБ', language)}` : `${(size / 1000).toFixed(0)} ${translate('КБ', language)}`
const formatTime = (value?: string) => { const seconds = Math.floor(Number(value ?? 0)); return `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${(seconds % 60).toString().padStart(2,'0')}` }
const mediaKind = (probe: ProbeResult | undefined, language: Language) => probe?.streams.some(stream => stream.codec_type === 'video') ? translate('Видео', language) : probe?.streams.some(stream => stream.codec_type === 'audio') ? translate('Аудио', language) : translate('Медиа', language)
const fileName = (file: string) => file.split(/[\\/]/).at(-1) ?? file
const parseClock = (value: string) => value.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0)

type FfmpegStatus = Awaited<ReturnType<typeof window.ffmpegStudio.ffmpegStatus>>
function applyAppearance(value: Appearance) {
  const dark = value.theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : value.theme === 'dark'
  const root = document.documentElement
  root.lang = value.language
  root.style.colorScheme = dark ? 'dark' : 'light'
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.palette = value.palette
  root.dataset.background = value.background
  root.dataset.density = value.density
  root.dataset.animations = String(value.animations && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  root.dataset.sidebarPosition = value.sidebarPosition
  for (const [name, token] of Object.entries(appearanceColorTokens(value, dark))) root.style.setProperty(name, token)
  root.style.setProperty('--accent-text', readableAccentText(value.accent))
  root.style.setProperty('--radius', `${value.radius}px`)
  root.style.setProperty('--radius-sm', `${Math.round(value.radius * 0.8)}px`)
  root.style.setProperty('--radius-md', `${value.radius}px`)
  root.style.setProperty('--radius-lg', `${Math.min(24, Math.round(value.radius * 1.5))}px`)
  root.style.setProperty('--ui-scale', String(value.scale))
  root.style.setProperty('--border-width', `${value.borderWidth}px`)
  root.style.setProperty('--shadow-strength', String(value.shadowStrength / 100))
  root.style.setProperty('--glass-alpha', `${value.glassOpacity}%`)
  root.style.setProperty('--glass-blur', `${value.glassBlur}px`)
  root.style.setProperty('--app-bg-image', value.backgroundImage ? `url("${value.backgroundImage}")` : 'none')
  root.style.setProperty('--background-dim', String(0.8 - value.glassOpacity / 100 * 0.65))
  root.style.setProperty('--font-body', value.font === 'system' ? '"Segoe UI", system-ui, sans-serif' : value.font === 'inter' ? 'Inter, "Segoe UI", sans-serif' : value.font === 'aptos' ? 'Aptos, "Segoe UI", sans-serif' : 'Arial, sans-serif')
  root.style.setProperty('--mono-font', value.monoFont === 'consolas' ? 'Consolas, monospace' : value.monoFont === 'cascadia' ? '"Cascadia Code", Consolas, monospace' : 'ui-monospace, Consolas, monospace')
  root.style.setProperty('--animation-duration', value.animationSpeed === 'slow' ? '0.45s' : value.animationSpeed === 'fast' ? '0.12s' : '0.25s')
}

function AppearanceSettings({ value, onChange }: { value: Appearance; onChange: (value: Appearance) => void }) {
  const tr = (message: string) => translate(message, value.language)
  const [profiles, setProfiles] = useState<{ name: string; appearance: Appearance }[]>([])
  const [profileName, setProfileName] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { void window.ffmpegStudio.getSettings().then(settings => setProfiles(settings.appearanceProfiles ?? [])) }, [])
  const update = (patch: Partial<Appearance>) => onChange(appearanceSchema.parse({ ...value, ...patch }))
  const updateColor = (key: keyof Appearance['colors'], color: string) => update({ palette: 'custom', colors: { ...value.colors, [key]: color } })
  const updateHotkey = (key: keyof Appearance['hotkeys'], shortcut: string) => {
    if (Object.entries(value.hotkeys).some(([other, current]) => other !== key && current.toLowerCase() === shortcut.toLowerCase())) { setNotice(tr("Эта комбинация уже назначена другому действию.")); return }
    update({ hotkeys: { ...value.hotkeys, [key]: shortcut } }); setNotice('')
  }
  const exportTheme = () => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
    link.download = 'ffmpeg-studio-theme.json'; link.click(); URL.revokeObjectURL(link.href)
  }
  const importTheme = async (file?: File) => {
    if (!file) return
    try { const parsed = appearanceSchema.safeParse(JSON.parse(await file.text())); if (!parsed.success) throw new Error(tr("Файл не соответствует схеме темы.")); onChange(parsed.data); setNotice(tr("Оформление импортировано.")) }
    catch (error) { setNotice(error instanceof Error ? tr(error.message) : tr("Не удалось прочитать тему.")) }
  }
  const saveProfile = async () => {
    const name = profileName.trim() || tr('Мой профиль')
    const next = [...profiles.filter(profile => profile.name !== name), { name, appearance: value }].slice(-20)
    setProfiles(next); await window.ffmpegStudio.setSettings({ appearanceProfiles: next }); setNotice(tr("Профиль оформления сохранён."))
  }
  const colors: [keyof Appearance['colors'], string][] = [['background',tr("Фон")], ['surface',tr("Поверхность")], ['border',tr("Границы")], ['text',tr("Текст")], ['muted',tr("Вторичный текст")], ['success',tr("Успех")], ['error',tr("Ошибка")], ['warning',tr("Предупреждение")]]
  return <section className="settings-card appearance-settings"><h2>{tr("Оформление")}</h2><p>{tr("Изменения применяются сразу и сохраняются автоматически.")}</p>
    <div className="setting-row"><label className="field">{tr("Режим темы")}<select value={value.theme} onChange={event => update({ theme: event.target.value as Appearance['theme'] })}><option value="system">{tr("Системная")}</option><option value="light">{tr("Светлая")}</option><option value="dark">{tr("Тёмная")}</option></select></label><label className="field">{tr("Готовая палитра")}<select value={value.palette} onChange={event => { const palette = event.target.value as Appearance['palette']; update({ palette, colors: palettes[palette].colors, accent: palettes[palette].accent }) }}>{Object.entries(paletteNames).map(([id,name]) => <option value={id} key={id}>{tr(name)}</option>)}<option value="custom">{tr("Своя тема")}</option></select></label><label className="field">{tr("Язык")}<select value={value.language} onChange={event => update({ language: event.target.value as Language })}><option value="ru">{tr("Русский")}</option><option value="en">{tr("Английский")}</option></select></label></div>
    <div className="palette-swatches">{Object.entries(paletteNames).map(([id,name]) => <button key={id} className={`palette-swatch ${value.palette === id ? 'active' : ''}`} title={tr(name)} aria-label={tr(name)} style={{ '--swatch-color': palettes[id as keyof typeof palettes].accent } as CSSProperties} onClick={() => update({ palette: id as Appearance['palette'], colors: palettes[id as keyof typeof palettes].colors, accent: palettes[id as keyof typeof palettes].accent })} />)}</div>
    <div className="setting-row"><label className="field">{tr("Акцентный цвет")}<input type="color" value={value.accent} onChange={event => update({ palette: 'custom', accent: event.target.value })} /></label><label className="field">HEX<input value={value.accent} onChange={event => { if (/^#[\da-f]{6}$/i.test(event.target.value)) update({ palette: 'custom', accent: event.target.value }) }} /></label><span className="contrast-preview" style={{ '--preview-accent': value.accent, '--preview-text': readableAccentText(value.accent) } as CSSProperties}>{tr("Текст с проверенным контрастом")}</span></div>
    <details className="appearance-details"><summary>{tr("Цвета своей темы")}</summary><div className="color-editor">{colors.map(([key,label]) => <label key={key}>{label}<input type="color" value={value.colors[key]} onChange={event => updateColor(key,event.target.value)} /></label>)}</div></details>
    <div className="setting-row"><label className="field">{tr("Фон приложения")}<select value={value.background} onChange={event => update({ background: event.target.value as Appearance['background'] })}><option value="solid">{tr("Сплошной")}</option><option value="gradient">{tr("Градиент")}</option><option value="glass">{tr("Стекло")}</option><option value="image">{tr("Своя картинка")}</option><option value="mica">Mica (Windows 11)</option><option value="acrylic">Acrylic (Windows 11)</option></select></label>{value.background === 'image' && <button className="secondary-button" onClick={() => void window.ffmpegStudio.chooseBackgroundImage().then(image => { if (image) { update({ backgroundImage: image }); setNotice(tr("Фон сохранён в папке данных приложения.")) } }).catch(error => setNotice(error instanceof Error ? tr(error.message) : tr("Не удалось сохранить изображение.")))}>{tr("Выбрать изображение")}</button>}</div>
    {value.background === 'image' && value.backgroundImage && <div className="background-preview"><img src={value.backgroundImage} alt={tr("Предпросмотр фона")} onError={() => { update({ background: 'gradient', backgroundImage: undefined }); setNotice(tr("Изображение недоступно. Возвращён градиент.")) }} /><button className="secondary-button" onClick={() => { update({ background: 'gradient', backgroundImage: undefined }); setNotice(tr("Картинка убрана. Используется градиент.")) }}>{tr("Убрать картинку")}</button></div>}
    {(value.background === 'glass' || value.background === 'image') && <div className="setting-row"><label className="field">{tr("Прозрачность")}<input type="range" min="20" max="100" value={value.glassOpacity} onChange={event => update({ glassOpacity: Number(event.target.value) })} /></label><label className="field">{tr("Размытие")}<input type="range" min="0" max="32" value={value.glassBlur} onChange={event => update({ glassBlur: Number(event.target.value) })} /></label></div>}
    <div className="setting-row appearance-sliders"><label className="field">{tr("Скругление:")} {value.radius}px<input type="range" min="0" max="24" value={value.radius} onChange={event => update({ radius: Number(event.target.value) })} /></label><label className="field">{tr("Границы:")} {value.borderWidth}px<input type="range" min="0" max="2" step="0.5" value={value.borderWidth} onChange={event => update({ borderWidth: Number(event.target.value) })} /></label><label className="field">{tr("Тени:")} {value.shadowStrength}%<input type="range" min="0" max="100" value={value.shadowStrength} onChange={event => update({ shadowStrength: Number(event.target.value) })} /></label></div>
    <div className="setting-row"><label className="field">{tr("Плотность")}<select value={value.density} onChange={event => update({ density: event.target.value as Appearance['density'] })}><option value="compact">{tr("Компактная")}</option><option value="normal">{tr("Обычная")}</option><option value="spacious">{tr("Свободная")}</option></select></label><label className="field">{tr("Шрифт")}<select value={value.font} onChange={event => update({ font: event.target.value as Appearance['font'] })}><option value="system">{tr("Системный")}</option><option value="inter">Inter</option><option value="aptos">Aptos</option><option value="arial">Arial</option></select></label><label className="field">{tr("Моноширинный")}<select value={value.monoFont} onChange={event => update({ monoFont: event.target.value as Appearance['monoFont'] })}><option value="system">{tr("Системный")}</option><option value="consolas">Consolas</option><option value="cascadia">Cascadia Code</option></select></label><label className="field">{tr("Масштаб:")} {Math.round(value.scale * 100)}%<input type="range" min="80" max="150" value={Math.round(value.scale * 100)} onChange={event => update({ scale: Number(event.target.value) / 100 })} /></label></div>
    <div className="setting-row"><label className="field">{tr("Панель навигации")}<select value={value.sidebarPosition} onChange={event => update({ sidebarPosition: event.target.value as Appearance['sidebarPosition'] })}><option value="left">{tr("Слева")}</option><option value="right">{tr("Справа")}</option></select></label><label><input type="checkbox" checked={value.sidebarCollapsed} onChange={event => update({ sidebarCollapsed: event.target.checked })} /> {tr("Свёрнутая панель")}</label><label><input type="checkbox" checked={value.sidebarLabels} onChange={event => update({ sidebarLabels: event.target.checked })} /> {tr("Подписи разделов")}</label><label><input type="checkbox" checked={value.showProfile} onChange={event => update({ showProfile: event.target.checked })} /> {tr("Показывать профиль")}</label></div>
    <details className="appearance-details"><summary>{tr("Разделы боковой панели")}</summary><p>{tr("Перетаскивайте разделы в панели для изменения порядка.")}</p><div className="setting-row">{nav.map(item => <label key={item.id}><input type="checkbox" checked={!value.hiddenSections.includes(item.id)} onChange={event => update({ hiddenSections: event.target.checked ? value.hiddenSections.filter(id => id !== item.id) : [...value.hiddenSections, item.id] })} /> {tr(item.title)}</label>)}</div></details>
    <div className="setting-row"><label><input type="checkbox" checked={value.animations} onChange={event => update({ animations: event.target.checked })} /> {tr("Анимации")}</label><label className="field">{tr("Скорость анимации")}<select value={value.animationSpeed} onChange={event => update({ animationSpeed: event.target.value as Appearance['animationSpeed'] })}><option value="slow">{tr("Медленно")}</option><option value="normal">{tr("Обычная")}</option><option value="fast">{tr("Быстро")}</option></select></label><label><input type="checkbox" checked={value.alwaysOnTop} onChange={event => update({ alwaysOnTop: event.target.checked })} /> {tr("Поверх окон")}</label><label><input type="checkbox" checked={value.minimizeToTray} onChange={event => update({ minimizeToTray: event.target.checked })} /> {tr("Сворачивать в трей")}</label><label><input type="checkbox" checked={value.startMinimized} onChange={event => update({ startMinimized: event.target.checked })} /> {tr("Запускать свёрнутым")}</label><label><input type="checkbox" checked={value.rememberWindow} onChange={event => update({ rememberWindow: event.target.checked })} /> {tr("Запоминать окно")}</label></div>
    <details className="appearance-details"><summary>{tr("Горячие клавиши")}</summary><div className="setting-row">{(['convert','open','settings'] as const).map(key => <label key={key} className="field">{{ convert: tr("Запуск"), open: tr("Добавить файлы"), settings: tr("Настройки") }[key]}<input value={value.hotkeys[key]} onChange={event => updateHotkey(key,event.target.value)} /></label>)}</div><small>{tr("Не назначайте одну комбинацию двум действиям. Например: Ctrl+Enter, Ctrl+O, Ctrl+,.")}</small></details>
    <div className="setting-row profile-row"><input value={profileName} placeholder={tr('Мой профиль')} onChange={event => setProfileName(event.target.value)} aria-label={tr("Имя профиля")} /><button className="secondary-button" onClick={() => void saveProfile()}>{tr("Сохранить профиль")}</button><select value="" onChange={event => { const profile = profiles.find(item => item.name === event.target.value); if (profile) onChange(profile.appearance) }}><option value="" disabled>{tr("Выбрать профиль…")}</option>{profiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name}</option>)}</select></div>
    <div className="setting-row"><button className="secondary-button" onClick={exportTheme}>{tr("Экспорт JSON")}</button><label className="secondary-button import-theme">{tr("Импорт JSON")}<input type="file" accept="application/json,.json" onChange={event => void importTheme(event.target.files?.[0])} /></label><button className="secondary-button" onClick={() => { if (window.confirm(tr("Сбросить все параметры оформления?"))) onChange(defaultAppearance) }}>{tr("Сбросить всё оформление")}</button></div>
    <div className="appearance-preview"><strong>{tr("Предпросмотр")}</strong><span>{tr("Текст · вторичный текст")}</span><button className="primary-button">{tr("Акцент")}</button><span className="engine-dot ready" /></div>
    {notice && <p role="status">{notice}</p>}
  </section>
}

function FfmpegSettings({ status, onStatus, language }: { status: FfmpegStatus; onStatus: (status: FfmpegStatus) => void; language: Language }) {
  const tr = (message: string) => translate(message, language)
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
    try { await window.ffmpegStudio.installFfmpeg({ build, channel }); onStatus(await window.ffmpegStudio.ffmpegStatus()); setMessage(tr("FFmpeg установлен и готов к работе.")) }
    catch (error) { setFailed(true); setMessage(error instanceof Error ? tr(error.message) : tr("Не удалось установить FFmpeg.")) }
    finally { setBusy(false); setProgress(null) }
  }
  const installOffline = async () => {
    setMessage('')
    try { const result = await window.ffmpegStudio.installFfmpegOffline(); if (result) onStatus(await window.ffmpegStudio.ffmpegStatus()) }
    catch (error) { setMessage(error instanceof Error ? tr(error.message) : tr("Не удалось установить архив.")) }
  }
  const choosePath = async () => {
    setMessage('')
    try { await window.ffmpegStudio.chooseFfmpegPath(); onStatus(await window.ffmpegStudio.ffmpegStatus()) }
    catch (error) { setMessage(error instanceof Error ? tr(error.message) : tr("Путь FFmpeg не прошёл проверку.")) }
  }
  const recheckCodecs = async () => {
    setBusy(true); setMessage('')
    try { await window.ffmpegStudio.recheckCodecs(); onStatus(await window.ffmpegStudio.ffmpegStatus()); setMessage(tr("Проверка энкодеров завершена.")) }
    catch (error) { setMessage(error instanceof Error ? tr(error.message) : tr("Не удалось проверить энкодеры.")) }
    finally { setBusy(false) }
  }
  const formatBytes = (value: number) => `${(value / 1_048_576).toFixed(1)} ${tr('МБ')}`
  return <section className="settings-card"><h2>FFmpeg</h2><p>{status.available ? `${tr('Готов')} · ${status.version} · ${status.source === 'managed' ? tr("установлен приложением") : status.source === 'custom' ? tr("пользовательский путь") : status.source === 'bundled' ? tr("встроенный") : tr("системный PATH")}` : tr("FFmpeg не найден. Он нужен для работы приложения.")}</p>
    <div className="setting-row"><div className="setting-path"><strong>{status.available ? status.path : tr("Не найден")}</strong><span>{status.available ? `${tr('Кодеки:')} ${status.encoders?.join(', ') || tr("не определены")} · GPU: ${status.gpu?.join(', ') || tr("не обнаружен")}` : tr("Другие разделы доступны; обработка включится после установки.")}</span></div><button className="secondary-button" onClick={() => void recheckCodecs()} disabled={busy || !status.available}>{tr("Перепроверить энкодеры")}</button><button className="secondary-button" onClick={() => void window.ffmpegStudio.testFfmpeg().then(() => setMessage(tr("Пробная кодировка 1 секунды прошла."))).catch(error => setMessage(error instanceof Error ? tr(error.message) : tr("Тест завершился ошибкой.")))}>{tr("Проверить работоспособность")}</button></div>
    <div className="setting-row setting-row-spaced"><label className="field">{tr("Сборка")}<select value={build} onChange={event => setBuild(event.target.value as typeof build)}><option value="essentials">Essentials</option><option value="full">Full</option></select></label><label className="field">{tr("Версия")}<select value={channel} onChange={event => setChannel(event.target.value as typeof channel)}><option value="stable">{tr("Стабильная")}</option><option value="latest">{tr("Последняя")}</option></select></label><button className="primary-button" disabled={busy} onClick={() => void install()}>{busy ? tr("Скачивание…") : status.available ? tr("Скачать / обновить") : tr("Скачать автоматически (рекомендуется)")}</button></div>
    {progress && <div className="download-progress"><div className="progress-track"><span style={{ width: `${progress.percent}%` }} /></div><span>{progress.total ? `${progress.percent.toFixed(0)}% · ${formatBytes(progress.received)} / ${formatBytes(progress.total)}` : `${formatBytes(progress.received)}${tr(' · размер неизвестен')}`} · {formatBytes(progress.speed)}/{tr('с')}{progress.eta ? ` · ~${Math.ceil(progress.eta)} ${tr('с')}` : ''}</span><button className="cancel-button" onClick={() => void window.ffmpegStudio.cancelFfmpegDownload()}>{tr("Отмена")}</button></div>}
    <div className="setting-row setting-row-compact-spaced"><button className="secondary-button" onClick={() => void installOffline()}>{tr("Выбрать архив или папку (офлайн)")}</button><button className="secondary-button" onClick={() => void choosePath()}>{tr("Указать путь вручную")}</button>{status.available && <><button className="secondary-button" onClick={() => void window.ffmpegStudio.reveal(status.path)}>{tr("Открыть папку")}</button><button className="secondary-button" onClick={() => void window.ffmpegStudio.removeFfmpeg().then(() => window.ffmpegStudio.ffmpegStatus()).then(onStatus)}>{tr("Удалить скачанную версию")}</button></>}</div>
    {!!status.versions?.length && <div className="setting-row setting-row-compact-spaced"><label className="field">{tr("Установленные версии")}<select value={selectedVersion} onChange={event => setSelectedVersion(event.target.value)}>{status.versions.map(version => <option value={version} key={version}>{version}</option>)}</select></label><button className="secondary-button" onClick={() => void window.ffmpegStudio.switchFfmpegVersion(selectedVersion).then(() => window.ffmpegStudio.ffmpegStatus()).then(onStatus)}>{tr("Использовать выбранную")}</button></div>}
    <div className="setting-row setting-row-compact-spaced"><label className="field proxy-field">{tr("Свой прокси")}<input value={proxy} onChange={event => setProxy(event.target.value)} placeholder="http://127.0.0.1:8080" /></label><button className="secondary-button" onClick={() => void window.ffmpegStudio.setSettings({ proxy })}>{tr("Сохранить прокси")}</button></div>
    {message && <p role="status">{message}</p>}{failed && <button className="secondary-button" disabled={busy} onClick={() => void install()}>{tr("Повторить")}</button>}
  </section>
}

function AboutSettings({ language }: { language: Language }) {
  const tr = (message: string) => translate(message, language)
  const [info, setInfo] = useState<{ version: string; license: string; ffmpegLicense: string } | null>(null)
  useEffect(() => { void window.ffmpegStudio.appInfo().then(setInfo) }, [])
  return <section className="settings-card about-settings"><h2>{tr("О программе")}</h2><div className="about-mark"><img src={faviconUrl} alt={tr("Логотип FFmpeg Studio")} /><div><strong>FFmpeg Studio</strong><span>{tr("Версия")} {info?.version ?? '…'}</span></div></div><p>{tr("Лицензия приложения:")} {info?.license ?? 'MIT'}.</p><p>{tr(info?.ffmpegLicense ?? '')}</p><button className="secondary-button" onClick={() => void window.ffmpegStudio.openRepository()}>{tr("Открыть репозиторий")}</button></section>
}

export function App() {
  const [section, setSection] = useState<Section>('converter')
  const [appearance, setAppearance] = useState<Appearance>(defaultAppearance)
  const languageRef = useRef(appearance.language)
  languageRef.current = appearance.language
  const tr = useCallback((message: string) => translate(message, languageRef.current), [])
  const [files, setFiles] = useState<MediaFile[]>([])
  const [preset, setPreset] = useState<Preset>(presets[0]!)
  const [targetFormat, setTargetFormat] = useState('mp4')
  const [videoCodec, setVideoCodec] = useState('auto')
  const [audioCodec, setAudioCodec] = useState('auto')
  const [imageCodec, setImageCodec] = useState('auto')
  const [qualityMode, setQualityMode] = useState<QualityMode>('balanced')
  const [codecProfile, setCodecProfile] = useState('')
  const [pixelFormat, setPixelFormat] = useState('')
  const [threads, setThreads] = useState(0)
  const [tune, setTune] = useState('')
  const [rowMt, setRowMt] = useState(true)
  const [filmGrain, setFilmGrain] = useState(0)
  const [svtParams, setSvtParams] = useState('')
  const [cpuUsed, setCpuUsed] = useState(4)
  const [deadline, setDeadline] = useState('good')
  const [lossless, setLossless] = useState(false)
  const [imageQuality, setImageQuality] = useState(80)
  const [imageLossless, setImageLossless] = useState(false)
  const [imageEffort, setImageEffort] = useState(7)
  const [audioBitrate, setAudioBitrate] = useState(192)
  const [audioQuality, setAudioQuality] = useState(5)
  const [compressionLevel, setCompressionLevel] = useState(5)
  const [trimStart, setTrimStart] = useState('00:00:00')
  const [trimEnd, setTrimEnd] = useState('')
  const [trimMode, setTrimMode] = useState(false)
  const [compressMode, setCompressMode] = useState(false)
  const [targetSizeMB, setTargetSizeMB] = useState('25')
  const [outputDir, setOutputDir] = useState('')
  const [quality, setQuality] = useState(23)
  const [advanced, setAdvanced] = useState(false)
  const [ffmpeg, setFfmpeg] = useState<FfmpegStatus>({ available: false, version: '', path: '', encoders: [], gpu: [], encoderAvailability: {} })
  const [jobs, setJobs] = useState<{ id: string; name: string; progress: number; status: 'working' | 'done' | 'error' | 'cancelled'; error?: string }[]>([])
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState('')
  const [profile, setProfile] = useState<{ name: string; avatarUrl?: string }>({ name: '' })
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const profileButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!profileMenuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setProfileMenuOpen(false)
      profileButtonRef.current?.focus()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [profileMenuOpen])
  const queuePausedRef = useRef(false)

  const changeAppearance = (value: Appearance) => {
    setAppearance(value); applyAppearance(value)
    void window.ffmpegStudio.setSettings({ appearance: value }).catch(error => setToast(error instanceof Error ? tr(error.message) : tr("Не удалось сохранить оформление.")))
  }

  useEffect(() => {
    void window.ffmpegStudio.getSettings().then(settings => { if (settings.outputDir) setOutputDir(settings.outputDir); if (settings.appearance) { setAppearance(settings.appearance); applyAppearance(settings.appearance) } if (settings.backgroundWarning) setToast(translate(settings.backgroundWarning, settings.appearance?.language ?? 'ru')) })
    void window.ffmpegStudio.getProfile().then(setProfile).catch(error => setToast(error instanceof Error ? tr(error.message) : tr("Не удалось загрузить профиль.")))
    void window.ffmpegStudio.ffmpegStatus().then(setFfmpeg)
    const unsubscribeProgress = window.ffmpegStudio.onProgress(progress => setJobs(current => current.map(job => job.id === progress.id ? { ...job, progress: progress.percent } : job)))
    const unsubscribeQueue = window.ffmpegStudio.onQueuePause(paused => { queuePausedRef.current = paused })
    return () => { unsubscribeProgress(); unsubscribeQueue() }
  }, [tr])

  const saveAvatar = async (file?: File) => {
    if (!file) return
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error(tr("Исходный аватар не должен превышать 20 МБ."))
      const image = await createImageBitmap(file)
      if (image.width > 12_000 || image.height > 12_000) { image.close(); throw new Error(tr("Размер изображения слишком велик.")) }
      const side = Math.min(image.width, image.height)
      const canvas = document.createElement('canvas')
      canvas.width = 256; canvas.height = 256
      const context = canvas.getContext('2d')
      if (!context) throw new Error(tr("Не удалось подготовить изображение."))
      context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256)
      image.close()
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error(tr("Не удалось преобразовать аватар в WebP."))), 'image/webp', 0.85))
      if (blob.type !== 'image/webp') throw new Error(tr("Браузер не поддерживает сохранение аватара WebP."))
      const avatarUrl = await window.ffmpegStudio.saveAvatar(new Uint8Array(await blob.arrayBuffer()))
      setProfile(current => ({ ...current, avatarUrl })); setProfileMenuOpen(false); setToast(tr("Аватар сохранён."))
    } catch (error) { setToast(error instanceof Error ? tr(error.message) : tr("Не удалось сохранить аватар.")) }
  }
  const profileInitials = (profile.name || tr("Пользователь")).trim().split(/\s+/).slice(0, 2).map(part => [...part][0] ?? '').join('').toLocaleUpperCase(appearance.language === 'ru' ? 'ru-RU' : 'en-US')
  const changeProfileName = async () => {
    const name = window.prompt(tr("Имя профиля"), profile.name)
    if (!name?.trim()) return
    try { await window.ffmpegStudio.setProfileName(name.trim()); setProfile(current => ({ ...current, name: name.trim() })); setProfileMenuOpen(false) }
    catch (error) { setToast(error instanceof Error ? tr(error.message) : tr("Не удалось сохранить имя.")) }
  }
  useEffect(() => {
    const listener = () => applyAppearance(appearance)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [appearance])
  useEffect(() => {
    if (appearance.hiddenSections.includes(section)) setSection(appearance.sidebarSections.find(id => !appearance.hiddenSections.includes(id)) ?? 'converter')
  }, [appearance.hiddenSections, appearance.sidebarSections, section])

  const outputPath = useMemo(() => outputDir || translate("Папка с исходным файлом", appearance.language), [appearance.language, outputDir])
  const effectiveVideoCodecId = videoCodec === 'auto' ? defaultVideoCodecForContainer(targetFormat, preset.id === 'h265') : videoCodec
  const selectedVideoCodec = codecById(effectiveVideoCodecId)
  const selectedAudioCodec = audioCodec === 'auto' ? defaultAudioCodecForContainer(targetFormat) : audioCodec
  const selectedImageCodec = imageCodec === 'auto' ? codecById(targetFormat) : codecById(imageCodec)
  const videoSettingsCodec = selectedImageCodec ? undefined : selectedVideoCodec
  const hasTargetSizeSupport = selectedVideoCodec?.targetSize === true && !selectedImageCodec && videoCodec !== 'copy' && qualityMode !== 'lossless' && preset.id !== 'mp3' && preset.id !== 'gif'
  const codecAvailable = (id: string) => {
    const definition = codecById(id)
    if (!definition) return true
    const status = ffmpeg.encoderAvailability?.[id]
    return status?.available ?? ffmpeg.encoders?.includes(id) ?? false
  }
  const codecTitle = (id: string) => {
    const codec = codecById(id)
    const availability = ffmpeg.encoderAvailability?.[id]
    if (availability?.available) return tr(codec?.description ?? '')
    if (codec?.hardware && availability?.reason !== 'encoder-missing') return tr("Энкодер найден, но пробная кодировка не прошла; проверьте драйвер и устройство.")
    return tr("Нет в вашей сборке FFmpeg; установите сборку Full в настройках FFmpeg.")
  }
  const isCompatibleOutput = (format: string) => {
    const imageOutput = codecById(format)?.type === 'image'
    const videoId = videoCodec === 'auto' ? defaultVideoCodecForContainer(format, preset.id === 'h265') : videoCodec
    const audioId = audioCodec === 'auto' ? defaultAudioCodecForContainer(format) : audioCodec
    const videoOk = imageOutput || videoId === 'none' || videoId === 'copy' || isCodecContainerCompatible(videoId, format)
    const audioOk = imageOutput || videoId === 'none' || audioId === 'copy' || isCodecContainerCompatible(audioId, format)
    const imageOk = imageCodec === 'auto' || isCodecContainerCompatible(imageCodec, format)
    return videoOk && audioOk && imageOk
  }
  const availableContainers = ['mp4','mkv','webm','mov','avi','mxf','ogv','ogg','3gp','opus','flac','m4a','wv','tta','ac3','eac3','spx','wav','avif','webp','jxl','jp2']
  const suggestFormat = (codecId: string) => {
    const definition = codecById(codecId)
    if (!definition) return
    setTargetFormat(current => definition.containers.includes(current) ? current : definition.defaultContainer)
  }
  const selectVideoCodec = (id: string) => {
    setVideoCodec(id)
    if (id !== 'auto' && id !== 'copy') suggestFormat(id)
    if (!codecById(id)?.targetSize) setCompressMode(false)
  }
  const selectAudioCodec = (id: string) => {
    setAudioCodec(id)
    if (id === 'auto' && videoCodec === 'none') setVideoCodec('auto')
    if (id !== 'auto' && id !== 'copy' && !isCodecContainerCompatible(id, targetFormat)) suggestFormat(id)
    const audioOnlyFormats = ['opus','ogg','flac','m4a','wv','tta','ac3','eac3','spx','wav']
    if (id !== 'auto' && id !== 'copy' && audioOnlyFormats.includes(codecById(id)?.defaultContainer ?? '')) setVideoCodec('none')
  }
  const selectTargetFormat = (format: string) => {
    setTargetFormat(format)
    if (['opus','flac','m4a','wv','tta','ac3','eac3','spx','wav'].includes(format) && audioCodec !== 'copy') setVideoCodec('none')
  }
  const selectImageCodec = (id: string) => {
    setImageCodec(id)
    if (id !== 'auto') suggestFormat(id)
  }
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
      } catch (error) { return { ...base, error: error instanceof Error ? tr(error.message) : tr("Не удалось прочитать файл") } }
    }))
    setFiles(current => [...current, ...added])
    if (added.length) setSection('converter')
  }
  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault(); setDragging(false)
    void addFiles(Array.from(event.dataTransfer.files).map(file => window.ffmpegStudio.getPathForFile(file)).filter(Boolean))
  }
  const convert = async () => {
    if (!files.length) { setToast(tr("Сначала добавьте медиафайлы")); return }
    if (!ffmpeg.available) { setToast(tr("FFmpeg не найден. Установите его или укажите путь в настройках.")); return }
    if (compressMode && (preset.id === 'mp3' || preset.id === 'gif')) { setToast(tr("Целевой размер доступен для видео. Выберите видеоформат.")); return }
    if (compressMode && !hasTargetSizeSupport) { setToast(tr("Целевой размер недоступен для этого кодека: используйте VP9, AV1 или другой кодек с двухпроходным режимом.")); return }
    if (!isCompatibleOutput(targetFormat)) { setToast(tr("Выбранная пара кодека и контейнера несовместима. Выберите предложенный контейнер.")); return }
    const unavailableCodec = [videoCodec, audioCodec, imageCodec].find(id => id !== 'auto' && id !== 'copy' && !codecAvailable(id))
    if (unavailableCodec) { setToast(tr("Этот кодек не прошёл проверку доступности. Перепроверьте FFmpeg или выберите другой кодек.")); return }
    const trimBegin = trimMode ? parseClock(trimStart) : undefined
    const trimFinish = trimMode && trimEnd ? parseClock(trimEnd) : undefined
    if (trimMode && (trimBegin === undefined || !Number.isFinite(trimBegin) || trimBegin < 0 || (trimFinish !== undefined && (!Number.isFinite(trimFinish) || trimFinish <= trimBegin)))) {
      setToast(tr("Проверьте время начала и конца фрагмента"))
      return
    }
    for (const file of files.filter(item => !item.error)) {
      while (queuePausedRef.current) await new Promise(resolve => setTimeout(resolve, 200))
      const id = crypto.randomUUID()
      const extension = preset.id === 'mp3' || preset.id === 'gif' ? preset.extension : targetFormat
      const stem = file.name.replace(/\.[^.]+$/, '')
      const output = `${outputDir || file.path.replace(/[\\/][^\\/]+$/, '')}/${stem}_${preset.id}.${extension}`
      const duration = Number(file.probe?.format.duration ?? 0)
      const start = trimBegin
      const clipDuration = start !== undefined && trimFinish !== undefined ? trimFinish - start : duration || undefined
      setJobs(current => [{ id, name: file.name, progress: 0, status: 'working' }, ...current])
      try {
        let result: { ok: boolean; output?: string }
        if (compressMode) {
          if (!clipDuration) throw new Error(tr("Файл должен содержать длительность для сжатия до заданного размера"))
          const audioKbps = 128
          const videoKbps = calculateTargetVideoBitrateKbps(Number(targetSizeMB), clipDuration, audioKbps)
          result = await window.ffmpegStudio.compress({ id, input: file.path, output, videoKbps, audioKbps, duration: clipDuration, start, videoCodec: effectiveVideoCodecId, quality, qualityMode, pixelFormat: pixelFormat || undefined, rowMt, cpuUsed, deadline, svtParams, audioCodec: selectedAudioCodec })
        } else {
          const args = buildFfmpegArgs({ input: file.path, output, format: extension, preset: preset.id, quality, start, duration: clipDuration, videoCodec: videoCodec === 'auto' ? undefined : videoCodec, audioCodec: audioCodec === 'auto' ? undefined : selectedAudioCodec, imageCodec: imageCodec === 'auto' ? undefined : imageCodec, qualityMode, profile: codecProfile || undefined, pixelFormat: pixelFormat || undefined, threads: threads || undefined, tune: tune || undefined, rowMt, filmGrain: selectedVideoCodec?.filmGrain ? filmGrain : undefined, svtParams: svtParams || undefined, cpuUsed, deadline, lossless, imageQuality, imageLossless, effort: imageEffort, audioBitrateKbps: audioBitrate, audioQuality, compressionLevel })
          result = await window.ffmpegStudio.convert({ id, input: file.path, output, args: args.slice(0, -1), duration: clipDuration })
        }
        setJobs(current => current.map(job => job.id === id ? { ...job, progress: 100, status: 'done' } : job))
        setToast(`${tr('Готово:')} ${fileName(result.output ?? output)}`)
      } catch (error) {
        setJobs(current => current.map(job => job.id === id ? { ...job, status: job.status === 'cancelled' ? 'cancelled' : 'error', error: job.status === 'cancelled' ? undefined : error instanceof Error ? tr(error.message) : tr("Ошибка FFmpeg") } : job))
      }
    }
    setSection('queue')
  }
  const mergeFiles = async () => {
    const inputs = files.filter(file => !file.error && file.probe?.streams.some(stream => stream.codec_type === 'video'))
    if (inputs.length < 2) { setToast(tr("Для склейки добавьте минимум два видеофайла")); return }
    const first = inputs[0]!
    const extension = first.name.split('.').at(-1) ?? 'mp4'
    const base = first.name.replace(/\.[^.]+$/, '')
    const output = `${outputDir || first.path.replace(/[\\/][^\\/]+$/, '')}/${base}_merged.${extension}`
    const id = crypto.randomUUID()
    setJobs(current => [{ id, name: `${inputs.length}${tr(' видеофайла · склейка')}`, progress: 0, status: 'working' }, ...current])
    try {
      const result = await window.ffmpegStudio.merge({ id, inputs: inputs.map(file => file.path), output })
      setJobs(current => current.map(job => job.id === id ? { ...job, progress: 100, status: 'done' } : job))
      setToast(`${tr('Готово:')} ${fileName(result.output ?? output)}`)
    } catch (error) {
      setJobs(current => current.map(job => job.id === id ? { ...job, status: 'error', error: error instanceof Error ? tr(error.message) : tr("Ошибка склейки") } : job))
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
      <div className="workspace-label">{tr("РАБОЧЕЕ ПРОСТРАНСТВО")}</div>
      <nav className="nav-list">{appearance.sidebarSections.filter(id => !appearance.hiddenSections.includes(id)).map(id => nav.find(item => item.id === id)!).map(item => <button key={item.id} draggable aria-label={tr(item.title)} data-tooltip={tr(item.title)} className={`nav-item ${section === item.id ? 'active' : ''}`} onDragStart={event => event.dataTransfer.setData('text/sidebar-section', item.id)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); event.stopPropagation(); const from = event.dataTransfer.getData('text/sidebar-section') as Section; const order = [...appearance.sidebarSections]; const oldIndex = order.indexOf(from); const newIndex = order.indexOf(item.id); if (oldIndex >= 0 && newIndex >= 0) { order.splice(oldIndex, 1); order.splice(newIndex, 0, from); changeAppearance({ ...appearance, sidebarSections: order }) } }} onClick={() => setSection(item.id)}><item.icon size={17} />{appearance.sidebarLabels && <span>{tr(item.title)}</span>}{item.id === 'queue' && jobs.some(job => job.status === 'working') && <span className="nav-count">{jobs.filter(job => job.status === 'working').length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="engine-card"><div className={`engine-dot ${ffmpeg.available ? 'ready' : ''}`} /><div><strong>{ffmpeg.available ? tr("FFmpeg готов") : tr("FFmpeg не найден")}</strong><span>{ffmpeg.available ? ffmpeg.version.replace('ffmpeg version ', tr("версия ")) : tr("укажите путь в настройках")}</span></div><MoreHorizontal size={15} /></div>{appearance.showProfile && <div className="profile-menu-anchor"><button ref={profileButtonRef} className="user-card" aria-label={tr("Открыть профиль")} aria-haspopup="menu" aria-expanded={profileMenuOpen} data-tooltip={profile.name || tr("Пользователь")} onClick={() => setProfileMenuOpen(open => !open)}><div className="avatar profile-avatar">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" onError={() => setProfile(current => ({ ...current, avatarUrl: undefined }))} /> : profileInitials}</div><div><strong>{profile.name || tr("Пользователь")}</strong></div><MoreHorizontal size={15} /></button>{profileMenuOpen && <div className="profile-menu" role="menu"><button role="menuitem" onClick={() => avatarInputRef.current?.click()}>{tr("Выбрать изображение…")}</button><button role="menuitem" onClick={() => void window.ffmpegStudio.setAvatarSource('windows').then(() => window.ffmpegStudio.getProfile()).then(setProfile).then(() => setProfileMenuOpen(false))}>{tr("Использовать аватар Windows")}</button><button role="menuitem" onClick={() => void window.ffmpegStudio.resetProfile().then(setProfile).then(() => setProfileMenuOpen(false))}>{tr("Сбросить")}</button><button role="menuitem" onClick={() => void changeProfileName()}>{tr("Изменить имя")}</button></div>}<input ref={avatarInputRef} hidden type="file" accept="image/*" onChange={event => { void saveAvatar(event.target.files?.[0]); event.currentTarget.value = '' }} /></div>}</div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>{tr("Пространство")}</span><span className="crumb-sep">/</span><strong>{tr(nav.find(item => item.id === section)?.title ?? '')}</strong></div></header>
      <div className="content-scroll">
        {section === 'converter' && <>
          <section className="page-heading"><div><div className="eyebrow"><WandSparkles size={13} /> {tr("МЕДИА-ИНСТРУМЕНТАРИЙ")}</div><h1>{tr("Конвертер")}</h1><p>{tr("Преобразуйте видео и аудио в несколько кликов.")}</p></div><button className={`mode-toggle ${advanced ? 'on' : ''}`} onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={15} /> {tr("Расширенный режим")} <span className="toggle-dot" /></button></section>
          {!ffmpeg.available && <div className="notice"><div className="notice-symbol">!</div><div><strong>{tr("FFmpeg не найден. Он нужен для работы приложения.")}</strong><span>{tr("Выберите рекомендуемую установку, путь к программе или готовый архив.")}</span></div><button onClick={() => { void window.ffmpegStudio.installFfmpeg({ build: 'essentials', channel: 'stable' }).then(() => window.ffmpegStudio.ffmpegStatus()).then(setFfmpeg).catch(error => setToast(error instanceof Error ? tr(error.message) : tr("Не удалось скачать FFmpeg."))) }}>{tr("Скачать автоматически")}</button><button onClick={() => { void window.ffmpegStudio.chooseFfmpegPath().then(() => window.ffmpegStudio.ffmpegStatus()).then(setFfmpeg).catch(error => setToast(error instanceof Error ? tr(error.message) : tr("Путь FFmpeg не прошёл проверку."))) }}>{tr("Указать путь вручную")}</button><button onClick={() => { void window.ffmpegStudio.installFfmpegOffline().then(() => window.ffmpegStudio.ffmpegStatus()).then(setFfmpeg).catch(error => setToast(error instanceof Error ? tr(error.message) : tr("Не удалось установить архив."))) }}>{tr("Выбрать архив (офлайн)")}</button></div>}
          <section className={`dropzone ${dragging ? 'dragging' : ''} ${files.length ? 'compact' : ''}`} onClick={() => void window.ffmpegStudio.chooseFiles().then(addFiles)} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') void window.ffmpegStudio.chooseFiles().then(addFiles) }}><div className="upload-icon"><Upload size={21} /></div><div className="drop-copy"><strong>{files.length ? tr("Добавьте ещё файлы") : tr("Перетащите файлы сюда")}</strong><span>{tr("Видео, аудио и изображения")} <i>·</i> {tr("до 20 ГБ на файл")}</span></div><button className="secondary-button" onClick={event => { event.stopPropagation(); void window.ffmpegStudio.chooseFiles().then(addFiles) }}><Plus size={15} /> {tr("Выбрать файлы")}</button></section>
          {files.length > 0 && <section className="source-section"><div className="section-header"><div><h2>{tr("Исходные файлы")} <span className="count-pill">{files.length}</span></h2><p>{tr("Файлы готовы к обработке")}</p></div><button className="subtle-button" onClick={() => setFiles([])}><Trash2 size={14} /> {tr("Очистить список")}</button></div><div className="file-list">{files.map(file => {
            const video = file.probe?.streams.find(stream => stream.codec_type === 'video')
            return <article className="file-card" key={file.path}><div className="file-preview">{file.thumbnail ? <img src={file.thumbnail} alt="" /> : <div className="file-glyph">{mediaKind(file.probe, appearance.language) === tr("Аудио") ? <FileAudio2 size={20} /> : <FileVideo2 size={20} />}</div>}<span className="duration">{formatTime(file.probe?.format.duration)}</span></div><div className="file-info"><strong title={file.name}>{file.name}</strong><span>{file.error ? tr("Ошибка чтения") : `${mediaKind(file.probe, appearance.language)} · ${file.probe?.format.format_name?.split(',')[0]?.toUpperCase() ?? tr("файл")}`}</span><div className="file-meta">{video ? `${video.width} × ${video.height}` : file.probe?.streams[0]?.codec_name ?? '—'} <i>·</i> {formatSize(file.size, appearance.language)}</div></div><div className="file-status"><span className={file.error ? 'status-bad' : ''}>{file.error ? tr("Ошибка") : tr("Готов")}</span><button className="small-icon" aria-label={tr("Удалить файл")} onClick={() => setFiles(current => current.filter(item => item.path !== file.path))}><X size={15} /></button></div></article>
          })}</div></section>}
          <section className="preset-section"><div className="section-header"><div><h2>{tr("Формат результата")}</h2><p>{tr("Выберите готовый вариант или настройте параметры вручную")}</p></div><button className="text-link" onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={14} /> {tr("Настроить")}</button></div><div className="preset-grid">{presets.map(item => <button key={item.id} className={`preset-card ${preset.id === item.id ? 'selected' : ''}`} onClick={() => setPreset(item)}><div className="preset-icon"><item.icon size={18} /></div><div className="preset-copy"><strong>{tr(item.title)}</strong><span>{tr(item.detail)}</span></div><span className="radio-mark">{preset.id === item.id && <Check size={11} />}</span></button>)}</div>
            {advanced && <div className="advanced-panel">
              <div className="field"><label>{tr("Контейнер")}</label><div className="select-wrap"><select value={targetFormat} onChange={event => selectTargetFormat(event.target.value)}>{availableContainers.map(format => <option key={format} value={format} disabled={!isCompatibleOutput(format)}>{format.toUpperCase()}</option>)}</select><ChevronDown size={14} /></div></div>
              <div className="field"><label>{tr("Видеокодек")}</label><div className="select-wrap"><select value={videoCodec} onChange={event => selectVideoCodec(event.target.value)}><option value="auto">{tr("Автоматически")}</option><option value="none">{tr("Только аудио")}</option><optgroup label={tr("Видеокодеки")}>{codecsOfType('video').map(codec => <option key={codec.id} value={codec.id} disabled={!codecAvailable(codec.id)} title={codecTitle(codec.id)}>{tr(codec.name)}{codecAvailable(codec.id) ? '' : ` · ${tr("недоступен")}`}</option>)}</optgroup><option value="copy">{tr("Копировать поток")}</option></select><ChevronDown size={14} /></div></div>
              <div className="field"><label>{tr("Аудиокодек")}</label><div className="select-wrap"><select value={audioCodec} onChange={event => selectAudioCodec(event.target.value)}><option value="auto">{tr("Автоматически")}</option><option value="copy">{tr("Копировать поток")}</option><optgroup label={tr("Аудиокодеки")}>{codecsOfType('audio').map(codec => <option key={codec.id} value={codec.id} disabled={!codecAvailable(codec.id)} title={codecTitle(codec.id)}>{tr(codec.name)}{codecAvailable(codec.id) ? '' : ` · ${tr("недоступен")}`}</option>)}</optgroup></select><ChevronDown size={14} /></div></div>
              <div className="field"><label>{tr("Кодек изображения")}</label><div className="select-wrap"><select value={imageCodec} onChange={event => selectImageCodec(event.target.value)}><option value="auto">{tr("Автоматически")}</option>{codecsOfType('image').map(codec => <option key={codec.id} value={codec.id} disabled={!codecAvailable(codec.id)} title={codecTitle(codec.id)}>{tr(codec.name)}{codecAvailable(codec.id) ? '' : ` · ${tr("недоступен")}`}</option>)}</select><ChevronDown size={14} /></div></div>
              {(videoSettingsCodec?.rateControl !== 'none' || selectedImageCodec) && <div className="field"><label>{tr("Режим качества")}</label><div className="select-wrap"><select value={qualityMode} onChange={event => setQualityMode(event.target.value as QualityMode)}><option value="fast">{tr("Быстро")}</option><option value="balanced">{tr("Сбалансированно")}</option><option value="maximum" title={tr("Лучшее сжатие занимает больше времени.")}>{tr("Максимальное сжатие")}</option><option value="lossless" disabled={!videoSettingsCodec?.lossless && !videoSettingsCodec?.losslessOption}>{tr("Без потерь")}</option></select><ChevronDown size={14} /></div></div>}
              {(videoSettingsCodec?.rateControl !== 'none' || selectedImageCodec) && <div className="field"><label htmlFor="quality">{tr("Качество")} <span>{selectedImageCodec ? 'QUALITY' : videoSettingsCodec?.rateControl?.toUpperCase() ?? 'CRF'} {quality}</span></label><input id="quality" type="range" min="0" max="63" value={quality} onChange={event => setQuality(Number(event.target.value))} /><div className="range-labels"><span>{tr("Высокое")}</span><span>{tr("Меньший файл")}</span></div></div>}
              {videoSettingsCodec?.profiles?.length ? <div className="field"><label>{tr("Профиль")}</label><div className="select-wrap"><select value={codecProfile} onChange={event => setCodecProfile(event.target.value)}><option value="">{tr("По умолчанию")}</option>{videoSettingsCodec.profiles.map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select><ChevronDown size={14} /></div></div> : null}
              {videoSettingsCodec?.pixelFormats?.length ? <div className="field"><label>{tr("Формат пикселей")}</label><div className="select-wrap"><select value={pixelFormat || videoSettingsCodec.pixelFormats[0]} onChange={event => setPixelFormat(event.target.value)}>{videoSettingsCodec.pixelFormats.map(value => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={14} /></div></div> : null}
              {videoSettingsCodec?.bitDepths?.length ? <div className="field"><label>{tr("Битность")}</label><div className="select-wrap"><select value={pixelFormat ? Number(pixelFormat.match(/(10|12)le/)?.[1] ?? 8) : videoSettingsCodec.bitDepths[0]} onChange={event => { const depth = Number(event.target.value); setPixelFormat(videoSettingsCodec.pixelFormats?.find(value => depth === 8 ? !/(10|12)le/.test(value) : value.includes(`${depth}le`)) ?? '') }}>{videoSettingsCodec.bitDepths.map(depth => <option key={depth} value={depth}>{depth} {tr("бит")}</option>)}</select><ChevronDown size={14} /></div></div> : null}
              {videoSettingsCodec?.threads && <div className="field"><label>{tr("Потоки")}</label><input type="number" min="0" max="128" value={threads} onChange={event => setThreads(Number(event.target.value))} /><small>{tr("0 — автоматически")}</small></div>}
              {videoSettingsCodec?.tune && <div className="field"><label>{tr("Настройка кодирования")}</label><div className="select-wrap"><select value={tune} onChange={event => setTune(event.target.value)}><option value="">{tr("По умолчанию")}</option>{(videoSettingsCodec.id.includes('nvenc') ? ['hq','ll','ull','lossless'] : ['film','animation','grain','stillimage','fastdecode','zerolatency']).map(value => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={14} /></div></div>}
              {videoSettingsCodec?.rowMt && <label className="trim-switch"><input type="checkbox" checked={rowMt} onChange={event => setRowMt(event.target.checked)} /> {tr("Многопоточная обработка строк")}</label>}
              {(videoSettingsCodec?.cpuUsed || videoSettingsCodec?.deadline) && <div className="field"><label>{tr("Скорость кодирования")} <span>{cpuUsed}</span></label><input type="range" min="0" max="8" value={cpuUsed} onChange={event => setCpuUsed(Number(event.target.value))} /><small>{tr("Для VP9 и libaom-av1: большее значение быстрее, но хуже сжатие.")}</small></div>}
              {videoSettingsCodec?.deadline && <div className="field"><label>{tr("Режим VP9")}</label><div className="select-wrap"><select value={deadline} onChange={event => setDeadline(event.target.value)}><option value="realtime">realtime</option><option value="good">good</option><option value="best">best</option></select><ChevronDown size={14} /></div></div>}
              {videoSettingsCodec?.filmGrain && <div className="field"><label>{tr("Зерно плёнки")} <span>{filmGrain}</span></label><input type="range" min="0" max="50" value={filmGrain} onChange={event => setFilmGrain(Number(event.target.value))} /></div>}
              {videoSettingsCodec?.svtParams && <div className="field"><label>{tr("Параметры SVT-AV1")}</label><input value={svtParams} onChange={event => setSvtParams(event.target.value)} placeholder="key=value,key=value" /></div>}
              {(videoSettingsCodec?.losslessOption || videoSettingsCodec?.lossless) && <label className="trim-switch"><input type="checkbox" checked={lossless} onChange={event => setLossless(event.target.checked)} /> {tr("Режим без потерь")}</label>}
              {selectedImageCodec && <><div className="field"><label>{tr("Качество изображения")} <span>{imageQuality}</span></label><input type="range" min="0" max="100" value={imageQuality} onChange={event => setImageQuality(Number(event.target.value))} /></div><label className="trim-switch"><input type="checkbox" checked={imageLossless} onChange={event => setImageLossless(event.target.checked)} /> {tr("Без потерь")}</label>{selectedImageCodec.effort && <div className="field"><label>{tr("Скорость / сжатие")} <span>{imageEffort}</span></label><input type="range" min="1" max="9" value={imageEffort} onChange={event => setImageEffort(Number(event.target.value))} /></div>}</>}
              {(audioCodec !== 'auto' || targetFormat === 'webm') && codecById(selectedAudioCodec)?.rateControl !== 'none' && <div className="field"><label>{tr("Битрейт аудио")} <span>{audioBitrate} kbit/s</span></label><input type="number" min="32" max="512" value={audioBitrate} onChange={event => setAudioBitrate(Number(event.target.value))} /></div>}
              {['flac','wavpack'].includes(selectedAudioCodec) && <div className="field"><label>{tr("Уровень сжатия")} <span>{compressionLevel}</span></label><input type="range" min="0" max={selectedAudioCodec === 'flac' ? 12 : 8} value={compressionLevel} onChange={event => setCompressionLevel(Number(event.target.value))} /></div>}
              {selectedAudioCodec === 'libvorbis' && <div className="field"><label>{tr("Качество Vorbis")} <span>{audioQuality}</span></label><input type="range" min="0" max="10" value={audioQuality} onChange={event => setAudioQuality(Number(event.target.value))} /></div>}
              {(videoSettingsCodec?.description || selectedImageCodec?.description) && <p className="codec-help">{tr(selectedImageCodec?.description || videoSettingsCodec?.description || '')}</p>}
            </div>}
            <div className="trim-tools"><label className="trim-switch"><input type="checkbox" checked={trimMode} onChange={event => setTrimMode(event.target.checked)} /> {tr("Обрезать фрагмент")}</label>{trimMode && <div className="trim-times"><label>{tr("Начало")} <input aria-label={tr("Начало")} value={trimStart} onChange={event => setTrimStart(event.target.value)} placeholder={tr("ЧЧ:ММ:СС")} /></label><label>{tr("Конец")} <input aria-label={tr("Конец")} value={trimEnd} onChange={event => setTrimEnd(event.target.value)} placeholder={tr("ЧЧ:ММ:СС")} /></label><span>{tr("Точная обрезка с перекодированием")}</span></div>}</div>
            {advanced && codecRegistry.some(codec => !codecAvailable(codec.id)) && <div className="notice"><div className="notice-symbol">!</div><div><strong>{tr("Некоторые кодеки не прошли проверку или отсутствуют в сборке FFmpeg.")}</strong><span>{tr("Установите сборку Full или выберите другой FFmpeg в настройках.")}</span></div><button onClick={() => setSection('settings')}>{tr("Настройки FFmpeg")}</button></div>}
            {!isCompatibleOutput(targetFormat) && <div className="notice"><div className="notice-symbol">!</div><div><strong>{tr("Выбранная пара кодека и контейнера несовместима.")}</strong><span>{tr("Предложен совместимый контейнер; выберите доступный формат в списке.")}</span></div><button onClick={() => { suggestFormat(videoCodec !== 'auto' ? videoCodec : audioCodec !== 'auto' ? audioCodec : imageCodec); }}>{tr("Исправить формат")}</button></div>}
            <div className="trim-tools"><label className="trim-switch"><input type="checkbox" checked={compressMode} disabled={!hasTargetSizeSupport} onChange={event => setCompressMode(event.target.checked)} /> {tr("Сжать до нужного размера")}</label>{compressMode && <div className="trim-times"><label>{tr("Размер, МБ")} <input aria-label={tr("Целевой размер в мегабайтах")} type="number" min="1" max="4096" value={targetSizeMB} onChange={event => setTargetSizeMB(event.target.value)} /></label><span>{`${targetFormat.toUpperCase()} · ${selectedVideoCodec ? tr(selectedVideoCodec.name) : effectiveVideoCodecId} · ${tr("двухпроходное кодирование")}`}</span></div>}{!hasTargetSizeSupport && <span>{tr("Для выбранного кодека двухпроходное кодирование не поддерживается.")}</span>}</div>
          </section>
          <section className="output-section"><div className="output-label"><FolderOpen size={16} /><div><strong>{tr("Папка сохранения")}</strong><span title={outputPath}>{outputDir || tr("Рядом с исходным файлом")}</span></div></div><button className="secondary-button browse-button" onClick={() => void window.ffmpegStudio.chooseDirectory().then(path => { if (path) { setOutputDir(path); void window.ffmpegStudio.setSettings({ outputDir: path }) } })}>{tr("Обзор")} <ChevronDown size={14} /></button></section>
          <footer className="convert-footer"><button className="primary-button" onClick={() => void convert()}><Play size={15} fill="currentColor" /> {tr("Конвертировать")} <span className="button-count">{files.length || 0}</span></button></footer>
        </>}
        {section === 'merge' && <><section className="page-heading"><div><div className="eyebrow"><Clapperboard size={13} /> {tr("ВИДЕО-МОНТАЖ")}</div><h1>{tr("Склейка видео")}</h1><p>{tr("Объедините видео с одинаковыми кодеками, разрешением и частотой кадров.")}</p></div><button className="secondary-button" onClick={() => void window.ffmpegStudio.chooseFiles().then(addFiles)}><Plus size={15} /> {tr("Добавить видео")}</button></section><div className="merge-list">{files.filter(file => !file.error && file.probe?.streams.some(stream => stream.codec_type === 'video')).map((file, index, items) => <article className="merge-item" key={file.path}><span className="merge-index">{index + 1}</span><div className="merge-file"><strong>{file.name}</strong><span>{file.probe?.streams.find(stream => stream.codec_type === 'video')?.codec_name} · {file.probe?.streams.find(stream => stream.codec_type === 'video')?.width} × {file.probe?.streams.find(stream => stream.codec_type === 'video')?.height} · {formatTime(file.probe?.format.duration)}</span></div><button className="small-icon" aria-label={tr("Переместить выше")} disabled={index === 0} onClick={() => setFiles(current => { const videoFiles = current.filter(item => item.probe?.streams.some(stream => stream.codec_type === 'video')); const [moved] = videoFiles.splice(index, 1); videoFiles.splice(index - 1, 0, moved!); return [...videoFiles, ...current.filter(item => !item.probe?.streams.some(stream => stream.codec_type === 'video'))] })}><ChevronUp size={15} /></button><button className="small-icon" aria-label={tr("Переместить ниже")} disabled={index === items.length - 1} onClick={() => setFiles(current => { const videoFiles = current.filter(item => item.probe?.streams.some(stream => stream.codec_type === 'video')); const [moved] = videoFiles.splice(index, 1); videoFiles.splice(index + 1, 0, moved!); return [...videoFiles, ...current.filter(item => !item.probe?.streams.some(stream => stream.codec_type === 'video'))] })}><ChevronDown size={15} /></button></article>)}</div><div className="merge-hint"><ShieldCheck size={16} /><span>{tr("Быстрая склейка без перекодирования. Все клипы должны иметь совместимые параметры потоков.")}</span></div><button className="primary-button" disabled={files.filter(file => file.probe?.streams.some(stream => stream.codec_type === 'video')).length < 2 || !ffmpeg.available} onClick={() => void mergeFiles()}><Play size={15} fill="currentColor" /> {tr("Склеить видео")}</button></>}
        {section === 'queue' && <><section className="page-heading"><div><div className="eyebrow"><Activity size={13} /> {tr("ПРОЦЕССЫ")}</div><h1>{tr("Очередь задач")}</h1><p>{tr("Следите за ходом обработки файлов.")}</p></div><button className="secondary-button" onClick={() => setSection('converter')}><Plus size={15} /> {tr("Новая задача")}</button></section>{jobs.length ? <div className="jobs-list">{jobs.map(job => <article className="job-card" key={job.id}><div className="job-icon">{job.status === 'done' ? <Check size={18} /> : job.status === 'error' || job.status === 'cancelled' ? <X size={18} /> : <Clapperboard size={18} />}</div><div className="job-body"><div className="job-title"><strong>{job.name}</strong><span>{job.status === 'working' ? tr("Обработка") : job.status === 'done' ? tr("Готово") : job.status === 'cancelled' ? tr("Отменено") : tr("Ошибка")}</span></div>{job.error && <p className="job-error">{job.error}</p>}<div className="progress-track"><span style={{ width: `${job.progress}%` }} /></div><div className="job-caption"><span>{Math.floor(job.progress)}{tr("% выполнено")}</span>{job.status === 'working' ? <button className="cancel-button" onClick={() => { setJobs(current => current.map(item => item.id === job.id ? { ...item, status: 'cancelled' } : item)); void window.ffmpegStudio.cancel(job.id) }}>{tr("Отменить")}</button> : <span />}</div></div></article>)}</div> : <div className="empty-state"><div className="empty-icon"><Activity size={24} /></div><h3>{tr("Очередь пока пуста")}</h3><p>{tr("Добавьте файлы в конвертер, чтобы начать обработку.")}</p><button className="primary-button" onClick={() => setSection('converter')}><Plus size={15} /> {tr("Добавить файлы")}</button></div>}</>}
        {section === 'history' && <><section className="page-heading"><div><div className="eyebrow"><History size={13} /> {tr("НЕДАВНИЕ ФАЙЛЫ")}</div><h1>{tr("История")}</h1><p>{tr("Недавние задачи этой сессии.")}</p></div></section><div className="empty-state"><div className="empty-icon"><Clock3 size={24} /></div><h3>{tr("Здесь появятся завершённые задачи")}</h3><p>{tr("История между перезапусками пока не сохраняется.")}</p></div></>}
        {section === 'settings' && <><section className="page-heading"><div><div className="eyebrow"><Settings2 size={13} /> {tr("ПРИЛОЖЕНИЕ")}</div><h1>{tr("Настройки")}</h1><p>{tr("Пути к инструментам и параметры обработки.")}</p></div></section><AppearanceSettings value={appearance} onChange={changeAppearance} /><FfmpegSettings status={ffmpeg} onStatus={setFfmpeg} language={appearance.language} /><section className="settings-card"><h2>{tr("Папка вывода по умолчанию")}</h2><p>{tr("Можно заменить для каждой задачи отдельно.")}</p><div className="setting-row"><div className="setting-path"><strong>{outputDir || tr("Рядом с исходным файлом")}</strong></div><button className="secondary-button" onClick={() => void window.ffmpegStudio.chooseDirectory().then(path => { if (path) { setOutputDir(path); void window.ffmpegStudio.setSettings({ outputDir: path }) } })}>{tr("Выбрать папку")}</button></div></section><AboutSettings language={appearance.language} /></>}
      </div>
    </main>
    {dragging && <div className="drag-overlay"><div><Upload size={34} /><strong>{tr("Отпустите файлы, чтобы добавить")}</strong><span>{tr("Видео, аудио или изображения")}</span></div></div>}
    {toast && <div className="toast"><Check size={15} />{toast}<button onClick={() => setToast('')} aria-label={tr("Закрыть")}><X size={14} /></button></div>}
  </div>
}
