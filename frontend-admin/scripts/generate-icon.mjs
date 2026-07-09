import { mkdir, writeFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.resolve(__dirname, '..', 'build', 'icon.ico')
const sizes = [16, 24, 32, 48, 64, 128, 256]

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[n] = c >>> 0
}

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)

  return Buffer.concat([length, typeBuffer, data, crc])
}

function insideRoundedRect(x, y, rectX, rectY, width, height, radius) {
  if (x < rectX || x > rectX + width || y < rectY || y > rectY + height) {
    return false
  }

  const cx = x < rectX + radius ? rectX + radius : x > rectX + width - radius ? rectX + width - radius : x
  const cy = y < rectY + radius ? rectY + radius : y > rectY + height - radius ? rectY + height - radius : y

  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
}

function insideRect(x, y, rectX, rectY, width, height) {
  return x >= rectX && x <= rectX + width && y >= rectY && y <= rectY + height
}

function sample(svgX, svgY) {
  if (!insideRoundedRect(svgX, svgY, 0, 0, 64, 64, 12)) {
    return [0, 0, 0, 0]
  }

  const isBar =
    insideRect(svgX, svgY, 16, 18, 32, 8) ||
    insideRect(svgX, svgY, 16, 30, 32, 8) ||
    insideRect(svgX, svgY, 16, 42, 20, 6)

  return isBar ? [255, 255, 255, 255] : [18, 165, 148, 255]
}

function createPng(size) {
  const bytesPerPixel = 4
  const scanlineLength = 1 + size * bytesPerPixel
  const pixels = Buffer.alloc(scanlineLength * size)
  const supersample = size <= 32 ? 5 : 3

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * scanlineLength
    pixels[rowOffset] = 0

    for (let x = 0; x < size; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < supersample; sy += 1) {
        for (let sx = 0; sx < supersample; sx += 1) {
          const svgX = ((x + (sx + 0.5) / supersample) / size) * 64
          const svgY = ((y + (sy + 0.5) / supersample) / size) * 64
          const [sr, sg, sb, sa] = sample(svgX, svgY)
          r += sr * sa
          g += sg * sa
          b += sb * sa
          a += sa
        }
      }

      const sampleCount = supersample * supersample
      const offset = rowOffset + 1 + x * bytesPerPixel
      const alpha = Math.round(a / sampleCount)

      pixels[offset] = alpha === 0 ? 0 : Math.round(r / a)
      pixels[offset + 1] = alpha === 0 ? 0 : Math.round(g / a)
      pixels[offset + 2] = alpha === 0 ? 0 : Math.round(b / a)
      pixels[offset + 3] = alpha
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND'),
  ])
}

function createIco(images) {
  const headerSize = 6
  const entrySize = 16
  const directorySize = headerSize + images.length * entrySize
  const header = Buffer.alloc(directorySize)

  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  let imageOffset = directorySize
  images.forEach(({ size, png }, index) => {
    const entryOffset = headerSize + index * entrySize
    header[entryOffset] = size === 256 ? 0 : size
    header[entryOffset + 1] = size === 256 ? 0 : size
    header[entryOffset + 2] = 0
    header[entryOffset + 3] = 0
    header.writeUInt16LE(1, entryOffset + 4)
    header.writeUInt16LE(32, entryOffset + 6)
    header.writeUInt32LE(png.length, entryOffset + 8)
    header.writeUInt32LE(imageOffset, entryOffset + 12)
    imageOffset += png.length
  })

  return Buffer.concat([header, ...images.map((image) => image.png)])
}

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(
  outputPath,
  createIco(sizes.map((size) => ({ size, png: createPng(size) }))),
)

console.log(`Generated ${path.relative(process.cwd(), outputPath)}`)
