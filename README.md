# FFmpeg Studio

**FFmpeg Studio** — настольная оболочка для локальной конвертации видео и аудио с помощью FFmpeg. Приложение не отправляет медиафайлы и не содержит телеметрию.

![Главное окно FFmpeg Studio](docs/screenshot.png)

## Возможности

- Импорт перетаскиванием или через выбор файла; чтение метаданных ffprobe и превью видео.
- Профили MP4/H.264 для веба, компактный H.265, MP3 и GIF.
- Прогресс, отмена, очередь задач и выбор папки результата.
- Настройки системного пути к FFmpeg.

## Требования и запуск

- Windows 11, Node.js 24+, npm и FFmpeg с ffprobe.
- Установите FFmpeg и добавьте его в PATH, затем выполните:

```sh
npm install
npm run dev
```

## Проверки и сборка

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run dist
```

`npm run dist` собирает NSIS-установщик и portable версию Windows. Разработка macOS и Linux сборок пока не настроена.

## Английский

FFmpeg Studio is a local desktop interface for common FFmpeg conversion workflows. Media is processed on your device and telemetry is not included.

## Структура

- `electron/` — main/preload процессы и изолированный IPC.
- `src/shared/` — типы и детерминированный построитель аргументов.
- `src/renderer/` — React интерфейс.
- `docs/` — архитектурные решения и заметки.

См. [архитектуру](docs/ARCHITECTURE.md), [решения](docs/DECISIONS.md) и [заметки FFmpeg](docs/FFMPEG_NOTES.md).

## Ограничения первой версии

Пока нет полноценного редактора таймлайна, склейки, target-size двухпроходного режима, сохранения истории между запусками, автоустановки FFmpeg и macOS/Linux дистрибутивов. Настройки расширенного режима носят базовый характер.

## Лицензия

MIT. См. [LICENSE](LICENSE).
