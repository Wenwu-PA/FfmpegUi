import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = process.cwd()
const build = path.join(root, 'build')
const icons = path.join(build, 'icons')
await fs.mkdir(icons, { recursive: true })

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
for (const size of sizes) {
  const source = size <= 32
    ? Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#60e6c2"/><stop offset="1" stop-color="#7566f3"/></linearGradient></defs><rect x="1" y="1" width="30" height="30" rx="8" fill="url(#g)"/><path d="M12 8.5a1.5 1.5 0 0 0-2.3 1.3v12.4a1.5 1.5 0 0 0 2.3 1.3l10-6.2a1.5 1.5 0 0 0 0-2.6z" fill="#101820"/></svg>`)
    : path.join(build, 'icon.svg')
  await sharp(source).resize(size, size).png().toFile(path.join(icons, `${size}.png`))
  await sharp(source).resize(size, size).png().toFile(path.join(icons, `${size}x${size}.png`))
}
await fs.copyFile(path.join(icons, '1024.png'), path.join(build, 'icon.png'))
await fs.copyFile(path.join(icons, '32.png'), path.join(root, 'src/renderer/favicon.png'))
await sharp(path.join(build, 'icon.svg')).resize(32, 32).greyscale().png().toFile(path.join(build, 'tray-icon.png'))
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
await fs.writeFile(path.join(build, 'icon.ico'), await pngToIco(icoSizes.map(size => path.join(icons, `${size}.png`))))

const icnsTypes = new Map([[16,'icp4'],[32,'icp5'],[64,'icp6'],[128,'ic07'],[256,'ic08'],[512,'ic09'],[1024,'ic10']])
const chunks = []
for (const [size, type] of icnsTypes) {
  const data = await fs.readFile(path.join(icons, `${size}.png`))
  const header = Buffer.alloc(8); header.write(type, 0, 4, 'ascii'); header.writeUInt32BE(data.length + 8, 4)
  chunks.push(header, data)
}
const body = Buffer.concat(chunks)
const icnsHeader = Buffer.alloc(8); icnsHeader.write('icns', 0, 4, 'ascii'); icnsHeader.writeUInt32BE(body.length + 8, 4)
await fs.writeFile(path.join(build, 'icon.icns'), Buffer.concat([icnsHeader, body]))
process.stdout.write(`Generated ${sizes.length} Linux PNG sizes, Windows ICO, macOS ICNS, favicon, and tray icon.\n`)
