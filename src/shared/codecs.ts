export type CodecType = 'video' | 'audio' | 'image'
export type QualityMode = 'fast' | 'balanced' | 'maximum' | 'lossless'

export type CodecDefinition = {
  id: string
  name: string
  type: CodecType
  encoder: string
  containers: readonly string[]
  defaultContainer: string
  description: string
  hardware?: boolean
  lossless?: boolean
  targetSize?: boolean
  rateControl?: 'crf' | 'qp' | 'bitrate' | 'quality' | 'none'
  presets?: boolean
  profiles?: readonly string[]
  pixelFormats?: readonly string[]
  bitDepths?: readonly number[]
  tune?: boolean
  threads?: boolean
  rowMt?: boolean
  filmGrain?: boolean
  svtParams?: boolean
  cpuUsed?: boolean
  deadline?: boolean
  losslessOption?: boolean
  imageQuality?: boolean
  effort?: boolean
  defaults: {
    quality?: number
    qualityMode?: QualityMode
    profile?: string
    pixelFormat?: string
    audioBitrateKbps?: number
    compressionLevel?: number
    audioQuality?: number
    imageQuality?: number
    effort?: number
  }
}

const codecDescriptions: Record<string, string> = {
  libx264: 'Универсальный H.264 для браузеров, телевизоров, Telegram и почти всех плееров. Совместимость максимальная, размер служит базой сравнения.',
  libx265: 'H.265 обычно даёт примерно на 25–40% меньший файл, чем H.264 при похожем качестве. Поддерживается современными телевизорами и устройствами.',
  libsvtav1: 'Быстрый программный AV1: обычно на 30–50% меньше H.264 при похожем качестве. CPU-кодирование всё ещё медленнее H.264; новые браузеры и устройства воспроизводят AV1.',
  'libaom-av1': 'AV1 с упором на качество и сжатие: примерно на 30–50% меньше H.264. Кодирование CPU медленное; поддержка зависит от браузера, телевизора и устройства.',
  librav1e: 'Программный AV1 с хорошим сжатием, но медленным кодированием CPU. Совместимость воспроизведения зависит от устройства и версии браузера.',
  'libvpx-vp9': 'VP9 обычно на 20–35% меньше H.264 при похожем качестве. Хорошо поддерживается браузерами, YouTube и многими новыми телевизорами.',
  libvvenc: 'H.266/VVC может сжимать сильнее AV1, но CPU-кодирование очень медленное, а поддержка плеерами и телевизорами пока ограничена.',
  prores_ks: 'Монтажный ProRes для MOV и MXF. Удобен для редактирования в монтажных программах, но создаёт очень большие файлы.',
  dnxhd: 'Монтажный DNxHR для Avid и других видеоредакторов. Создаёт очень большие файлы; выбирайте профиль под нужное качество и цветность.',
  ffv1: 'Побитово точный lossless-кодек для архива и обработки. Требует много места; чаще всего используется в контейнере MKV.',
  utvideo: 'Быстрый lossless-кодек для промежуточных файлов монтажа. Файлы очень большие, воспроизведение требует совместимого плеера.',
  huffyuv: 'Старый lossless-кодек для архива и промежуточного монтажа. Даёт очень большие файлы и ограниченную совместимость.',
  libtheora: 'Открытый видеокодек для OGG и старых веб-плееров. Обычно хуже сжимает, чем H.264 и VP9.',
  mjpeg: 'Каждый кадр хранится как JPEG. Подходит для совместимых монтажных и технических задач, но видео занимает много места.',
  mpeg4: 'Старый MPEG-4 Part 2 для устаревших устройств и AVI. Файлы обычно больше H.264 при похожем качестве.',
  h263: 'Устаревший видеокодек для старых телефонов и 3GP. Ограниченное качество и совместимость.',
  libopus: 'Современный аудиокодек для речи и музыки. Поддерживается браузерами, приложениями и большинством новых устройств.',
  aac: 'Универсальный аудиокодек для MP4, MOV и большинства телевизоров, браузеров и плееров.',
  pcm_s16le: 'Несжатое PCM-аудио без потерь кодирования. Файлы большие; часто используется в WAV и монтажных контейнерах.',
  flac: 'Lossless-аудио без потери исходного качества. Хорошо подходит для архива и музыкальных плееров.',
  alac: 'Lossless-аудио Apple для музыкальных библиотек и устройств, поддерживающих ALAC.',
  wavpack: 'Lossless-аудио с режимом сжатия; поддержка зависит от музыкального плеера.',
  tta: 'Lossless-аудио для архивирования. Поддерживается меньшим числом плееров, чем FLAC.',
  libvorbis: 'Открытый аудиокодек для OGG и WebM, хорошо подходит для веба и музыки.',
  ac3: 'Dolby Digital для телевизоров, ресиверов и домашних кинотеатров.',
  eac3: 'Dolby Digital Plus для современных телевизоров и домашних кинотеатров.',
  libspeex: 'Кодек речи для узкополосного голоса и старых интернет-телефонных систем.',
  avif: 'Современный формат неподвижных изображений с хорошим сжатием. Поддержка есть в новых браузерах и приложениях.',
  webp: 'Формат изображений для веба; поддерживает lossy и lossless режимы и широко открывается браузерами.',
  jxl: 'Современный JPEG XL с lossless- и lossy-режимами. Поддержка зависит от браузера и программы просмотра.',
  jp2: 'JPEG 2000 для профессиональных и архивных задач. Обычные браузеры и бытовые плееры поддерживают его ограниченно.',
}

const video = (id: string, name: string, encoder = id, options: Partial<CodecDefinition> = {}): CodecDefinition => ({
  id, name, type: 'video', encoder, containers: ['mp4', 'mkv'], defaultContainer: 'mkv', description: codecDescriptions[id] ?? '',
  rateControl: 'crf', presets: true, pixelFormats: ['yuv420p'], bitDepths: [8], threads: true, targetSize: false,
  defaults: { quality: 23, qualityMode: 'balanced', pixelFormat: 'yuv420p' }, ...options,
})

const audio = (id: string, name: string, encoder = id, containers = ['mkv'], defaultContainer = containers[0] ?? 'mkv', options: Partial<CodecDefinition> = {}): CodecDefinition => ({
  id, name, type: 'audio', encoder, containers, defaultContainer, description: codecDescriptions[id] ?? '', rateControl: 'bitrate',
  defaults: { audioBitrateKbps: 192, compressionLevel: id === 'wavpack' ? 3 : 5, audioQuality: 5 }, ...options,
})

const image = (id: string, name: string, encoder: string, container: string, options: Partial<CodecDefinition> = {}): CodecDefinition => ({
  id, name, type: 'image', encoder, containers: [container], defaultContainer: container, description: codecDescriptions[id] ?? '', rateControl: 'quality', imageQuality: true,
  defaults: { qualityMode: 'balanced', imageQuality: 80, effort: 7 }, ...options,
})

export const codecRegistry: readonly CodecDefinition[] = [
  video('libx264', 'H.264', 'libx264', { containers: ['mp4','mkv','mov','avi'], defaultContainer: 'mp4', targetSize: true, tune: true, profiles: ['baseline','main','high'], pixelFormats: ['yuv420p','yuv420p10le'], bitDepths: [8,10] }),
  video('libx265', 'H.265 / HEVC', 'libx265', { containers: ['mp4','mkv','mov'], defaultContainer: 'mp4', targetSize: true, tune: true, profiles: ['main','main10','main12'], pixelFormats: ['yuv420p','yuv420p10le','yuv420p12le'], bitDepths: [8,10,12] }),
  video('libsvtav1', 'AV1 · SVT-AV1', 'libsvtav1', { containers: ['mp4','mkv','webm'], defaultContainer: 'mkv', filmGrain: true, svtParams: true, pixelFormats: ['yuv420p','yuv420p10le'], bitDepths: [8,10] }),
  video('libaom-av1', 'AV1 · libaom', 'libaom-av1', { containers: ['mp4','mkv','webm'], defaultContainer: 'mkv', targetSize: true, rowMt: true, cpuUsed: true, pixelFormats: ['yuv420p','yuv420p10le','yuv420p12le'], bitDepths: [8,10,12] }),
  video('librav1e', 'AV1 · rav1e', 'librav1e', { containers: ['mp4','mkv','webm'], defaultContainer: 'mkv', rateControl: 'qp', pixelFormats: ['yuv420p','yuv420p10le'], bitDepths: [8,10] }),
  video('libvpx-vp9', 'VP9', 'libvpx-vp9', { containers: ['webm','mkv','mp4'], defaultContainer: 'webm', targetSize: true, cpuUsed: true, deadline: true, rowMt: true, losslessOption: true, pixelFormats: ['yuv420p','yuv420p10le','yuv420p12le'], bitDepths: [8,10,12] }),
  video('libvvenc', 'H.266 / VVC', 'libvvenc', { containers: ['mp4','mkv'], defaultContainer: 'mkv', rateControl: 'qp', pixelFormats: ['yuv420p10le'], bitDepths: [10] }),
  video('prores_ks', 'Apple ProRes', 'prores_ks', { containers: ['mov','mxf'], defaultContainer: 'mov', rateControl: 'none', presets: false, profiles: ['proxy','lt','422','hq','4444'], pixelFormats: ['yuv422p10le','yuv444p10le','yuva444p10le'], bitDepths: [10], defaults: { qualityMode: 'balanced', profile: '422', pixelFormat: 'yuv422p10le' } }),
  video('dnxhd', 'Avid DNxHR', 'dnxhd', { containers: ['mxf','mov'], defaultContainer: 'mov', rateControl: 'none', presets: false, profiles: ['lb','sq','hq','hqx','444'], pixelFormats: ['yuv422p','yuv422p10le','yuv444p10le'], bitDepths: [8,10], defaults: { qualityMode: 'balanced', profile: 'hq', pixelFormat: 'yuv422p' } }),
  video('ffv1', 'FFV1', 'ffv1', { containers: ['mkv'], defaultContainer: 'mkv', rateControl: 'none', presets: false, lossless: true, pixelFormats: ['yuv420p','yuv422p','yuv444p','rgb24','gbrp','yuv420p10le'], bitDepths: [8,10,12] }),
  video('utvideo', 'Ut Video', 'utvideo', { containers: ['avi','mkv'], defaultContainer: 'avi', rateControl: 'none', presets: false, lossless: true, pixelFormats: ['yuv420p','yuv422p','yuv444p','gbrp','gbrap'], bitDepths: [8,10] }),
  video('huffyuv', 'HuffYUV', 'huffyuv', { containers: ['avi','mkv'], defaultContainer: 'avi', rateControl: 'none', presets: false, lossless: true, pixelFormats: ['yuv422p','rgb24','bgra'], bitDepths: [8] }),
  video('libtheora', 'Theora', 'libtheora', { containers: ['ogv','ogg','webm','mkv'], defaultContainer: 'ogv', rateControl: 'quality', presets: false, targetSize: false }),
  video('mjpeg', 'Motion JPEG', 'mjpeg', { containers: ['avi','mov','mkv','mp4'], defaultContainer: 'avi', rateControl: 'quality', presets: false, pixelFormats: ['yuvj420p','yuvj422p','yuvj444p'], targetSize: false }),
  video('mpeg4', 'MPEG-4 Part 2', 'mpeg4', { containers: ['avi','mp4','mkv'], defaultContainer: 'avi', rateControl: 'quality', presets: false, targetSize: true }),
  video('h263', 'H.263', 'h263', { containers: ['3gp','avi','mkv'], defaultContainer: '3gp', rateControl: 'bitrate', presets: false, targetSize: false }),
  video('h264_nvenc', 'H.264 · NVIDIA NVENC', 'h264_nvenc', { hardware: true, containers: ['mp4','mkv','mov'], defaultContainer: 'mp4', rateControl: 'qp', presets: true, tune: true, profiles: ['baseline','main','high'], pixelFormats: ['yuv420p','yuv420p10le'], bitDepths: [8,10] }),
  video('hevc_nvenc', 'H.265 · NVIDIA NVENC', 'hevc_nvenc', { hardware: true, containers: ['mp4','mkv','mov'], defaultContainer: 'mp4', rateControl: 'qp', profiles: ['main','main10'], pixelFormats: ['yuv420p','yuv420p10le'], bitDepths: [8,10] }),
  video('av1_nvenc', 'AV1 · NVIDIA NVENC', 'av1_nvenc', { hardware: true, containers: ['mp4','mkv','webm'], defaultContainer: 'mkv', rateControl: 'qp', pixelFormats: ['yuv420p','yuv420p10le'], bitDepths: [8,10] }),
  video('h264_qsv', 'H.264 · Intel QSV', 'h264_qsv', { hardware: true, containers: ['mp4','mkv','mov'], defaultContainer: 'mp4', rateControl: 'qp', profiles: ['baseline','main','high'], pixelFormats: ['nv12'], bitDepths: [8] }),
  video('hevc_qsv', 'H.265 · Intel QSV', 'hevc_qsv', { hardware: true, containers: ['mp4','mkv','mov'], defaultContainer: 'mp4', rateControl: 'qp', profiles: ['main','main10'], pixelFormats: ['nv12','p010le'], bitDepths: [8,10] }),
  video('av1_qsv', 'AV1 · Intel QSV', 'av1_qsv', { hardware: true, containers: ['mp4','mkv','webm'], defaultContainer: 'mkv', rateControl: 'qp', pixelFormats: ['nv12','p010le'], bitDepths: [8,10] }),
  video('h264_amf', 'H.264 · AMD AMF', 'h264_amf', { hardware: true, containers: ['mp4','mkv','mov'], defaultContainer: 'mp4', rateControl: 'qp' }),
  video('hevc_amf', 'H.265 · AMD AMF', 'hevc_amf', { hardware: true, containers: ['mp4','mkv','mov'], defaultContainer: 'mp4', rateControl: 'qp', pixelFormats: ['nv12','p010le'], bitDepths: [8,10] }),
  video('av1_amf', 'AV1 · AMD AMF', 'av1_amf', { hardware: true, containers: ['mp4','mkv','webm'], defaultContainer: 'mkv', rateControl: 'qp', pixelFormats: ['nv12','p010le'], bitDepths: [8,10] }),

  audio('aac', 'AAC', 'aac', ['mp4','mkv','mov','avi','3gp','m4a'], 'm4a'),
  audio('pcm_s16le', 'PCM 16-bit', 'pcm_s16le', ['wav','mxf','mov','mkv'], 'wav', { rateControl: 'none', lossless: true }),
  audio('libopus', 'Opus', 'libopus', ['opus','ogg','webm','mkv'], 'opus'),
  audio('flac', 'FLAC', 'flac', ['flac','mkv'], 'flac', { rateControl: 'none', lossless: true }),
  audio('alac', 'Apple Lossless (ALAC)', 'alac', ['m4a','mp4','mov','mkv'], 'm4a', { rateControl: 'none', lossless: true }),
  audio('wavpack', 'WavPack', 'wavpack', ['wv','mkv'], 'wv', { rateControl: 'quality', lossless: true }),
  audio('tta', 'TTA', 'tta', ['tta','mkv'], 'tta', { rateControl: 'none', lossless: true }),
  audio('libvorbis', 'Vorbis', 'libvorbis', ['ogg','webm','mkv'], 'ogg', { rateControl: 'quality' }),
  audio('ac3', 'AC-3', 'ac3', ['ac3','mkv','mp4','ts'], 'ac3'),
  audio('eac3', 'E-AC-3', 'eac3', ['eac3','mkv','mp4','ts'], 'eac3'),
  audio('libspeex', 'Speex', 'libspeex', ['spx','ogg','mkv'], 'spx'),

  image('avif', 'AVIF', 'libaom-av1', 'avif', { lossless: true, effort: true }),
  image('webp', 'WebP', 'libwebp', 'webp', { lossless: true }),
  image('jxl', 'JPEG XL', 'libjxl', 'jxl', { lossless: true, effort: true, bitDepths: [8,10,12] }),
  image('jp2', 'JPEG 2000', 'libopenjpeg', 'jp2', { lossless: true }),
]

export const codecById = (id: string) => codecRegistry.find(codec => codec.id === id)
export const codecsOfType = (type: CodecType) => codecRegistry.filter(codec => codec.type === type)

const audioOnlyContainers = new Set(['opus','flac','m4a','wv','tta','ac3','eac3','spx','wav'])
const imageContainers = new Set(['avif','webp','jxl','jp2'])
export function defaultVideoCodecForContainer(container: string, h265 = false): string {
  const format = container.toLowerCase().replace(/^\./, '')
  if (audioOnlyContainers.has(format) || imageContainers.has(format)) return 'none'
  if (format === 'webm') return 'libvpx-vp9'
  if (format === 'avi') return 'mpeg4'
  if (format === '3gp') return 'h263'
  if (format === 'mxf') return 'dnxhd'
  if (format === 'ogg' || format === 'ogv') return 'libtheora'
  return h265 ? 'libx265' : 'libx264'
}

export function defaultAudioCodecForContainer(container: string): string {
  const format = container.toLowerCase().replace(/^\./, '')
  return ({ webm: 'libopus', opus: 'libopus', ogg: 'libvorbis', ogv: 'libvorbis', flac: 'flac', wv: 'wavpack', tta: 'tta', ac3: 'ac3', eac3: 'eac3', spx: 'libspeex', mxf: 'pcm_s16le', wav: 'pcm_s16le' } as Record<string,string>)[format] ?? 'aac'
}

export function parseEncoderList(text: string): string[] {
  const result = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*[VAS][\w.]{5}\s+([a-z0-9_.-]+)\s+/i)
    if (match?.[1]) result.add(match[1])
  }
  return [...result]
}

export function isCodecContainerCompatible(codecId: string, container: string): boolean {
  return codecById(codecId)?.containers.includes(container.toLowerCase().replace(/^\./, '')) ?? false
}

export function recommendedContainer(codecId: string): string | undefined {
  return codecById(codecId)?.defaultContainer
}

export function supportsTargetSize(codecId: string): boolean {
  return codecById(codecId)?.targetSize === true
}
