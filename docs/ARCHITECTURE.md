# Архитектура

```mermaid
flowchart LR
  UI[React renderer] -->|typed API| PRE[preload contextBridge]
  PRE -->|validated IPC| MAIN[Electron main]
  MAIN -->|spawn argv| FFMPEG[ffmpeg / ffprobe]
  FFMPEG -->|progress and JSON| MAIN
  MAIN -->|progress events| PRE
  PRE --> UI
```

Приложение разделено на безопасный renderer, узкий preload и main-процесс. В renderer отсутствует доступ к Node.js. IPC значения проверяются схемами Zod, процессы запускаются массивом аргументов без shell. Настройки сохраняются через `electron-store`.
