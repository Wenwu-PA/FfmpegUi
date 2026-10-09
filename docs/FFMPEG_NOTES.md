# FFmpeg download sources

Sources are configured in [`resources/ffmpeg-sources.json`](../resources/ffmpeg-sources.json). Links checked on 2026-10-09:

- Windows stable Essentials: `https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip` (HTTP 200), SHA-256 sidecar `.sha256` (HTTP 200).
- Windows stable Full: `https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full.7z` with its `.sha256` and `.ver` sidecars.
- Windows latest Essentials/Full: Gyan's `.7z` git-master artifacts with `.sha256` sidecars. The `.zip` git-master URL was tested and returns 404, so it is intentionally not used.
- Windows fallback: latest GitHub release API from `BtbN/FFmpeg-Builds`; installer selects the `win64-gpl.zip` asset. This is a GPL build and may be materially larger than Gyan Essentials.
- macOS: evermeet.cx release/snapshot downloads for `ffmpeg` and `ffprobe` as separate ZIP archives. These are Intel builds; ARM64 may run through Rosetta where available.
- Linux x86_64: John Van Sickle static release and git-master `.tar.xz` builds, each containing `ffmpeg` and `ffprobe`.

HTTP checks on 2026-10-09 returned 200 for the Windows stable Essentials archive and SHA-256 sidecar; Full `.7z` and its SHA/version sidecars; git-master Essentials/Full `.7z` and SHA/version sidecars; macOS release and snapshot downloads; and both Linux archives. The obsolete Gyan git-master ZIP endpoint returned 404 and is not configured. The installer verifies Gyan SHA-256 values when present. The fallback does not expose a checksum in the source manifest, so fallback downloads are checked by byte count and post-extraction `-version` probes.

## Licensing

FFmpeg is a project, not a single license choice: its code and build configuration may be LGPL or GPL depending on enabled components. Gyan documents its listed builds as static GPLv3 builds; the selected BtbN `gpl` fallback is also GPL. The user must follow the downloaded build's included license notices and applicable redistribution obligations. FFmpeg Studio does not bundle these binaries in its repository or installer; it downloads them only after an explicit user action.

References: [Gyan builds and checksum API](https://www.gyan.dev/ffmpeg/builds/), [BtbN releases](https://github.com/BtbN/FFmpeg-Builds/releases), [evermeet.cx](https://evermeet.cx/ffmpeg/), [John Van Sickle static builds](https://johnvansickle.com/ffmpeg/).
