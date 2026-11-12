// A small PNG reader and writer, so card-art validation does not depend on an
// image library.
//
// What it reads: 8-bit greyscale (colour type 0), RGB (2) and RGBA (6), with no
// interlacing and no tRNS chunk. Anything else is refused by name. What it
// writes: the same three colour types, filter 0 on every row, zlib's default
// deflate, which is deterministic for a given input and Node version.
//
// Why a decoder and not a dependency: the ingest check must be reproducible on
// any machine and in CI without native code. The only image dependency in this
// package is jpeg-js, pinned, pure JavaScript, for the JPEG case that hosted
// image models actually export.

import zlib from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 6: 4 };
const TYPE_NAMES = { 0: "greyscale", 2: "RGB", 6: "RGBA" };

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

export class PngError extends Error {}

export function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

// The format by its magic bytes. The refusal names what it found, so a person
// who drops a WebP or a PDF into the folder is told which, not "invalid file".
export function sniffFormat(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(SIGNATURE)) return "png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString("latin1");
    if (head === "GIF87a" || head === "GIF89a") return "gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "webp";
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  return "unknown";
}

function readChunk(buffer, offset) {
  if (offset + 12 > buffer.length) {
    throw new PngError("truncated chunk");
  }
  const length = buffer.readUInt32BE(offset);
  const type = buffer.subarray(offset + 4, offset + 8).toString("latin1");
  const dataStart = offset + 8;
  const dataEnd = dataStart + length;
  if (dataEnd + 4 > buffer.length) {
    throw new PngError(`truncated ${type} chunk`);
  }
  const data = buffer.subarray(dataStart, dataEnd);
  const expected = buffer.readUInt32BE(dataEnd);
  const actual = crc32(buffer.subarray(offset + 4, dataEnd));
  if (expected !== actual) {
    throw new PngError(`${type} chunk failed its CRC check`);
  }
  return { type, data, next: dataEnd + 4 };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buffer) {
  if (sniffFormat(buffer) !== "png") {
    throw new PngError("not a PNG: the signature is absent");
  }
  let offset = 8;
  let header = null;
  const idat = [];
  let ended = false;
  while (offset < buffer.length) {
    const chunk = readChunk(buffer, offset);
    offset = chunk.next;
    if (chunk.type === "IHDR") {
      if (chunk.data.length !== 13) throw new PngError("IHDR is not 13 bytes");
      header = {
        width: chunk.data.readUInt32BE(0),
        height: chunk.data.readUInt32BE(4),
        bitDepth: chunk.data[8],
        colorType: chunk.data[9],
        compression: chunk.data[10],
        filter: chunk.data[11],
        interlace: chunk.data[12],
      };
    } else if (chunk.type === "IDAT") {
      idat.push(chunk.data);
    } else if (chunk.type === "tRNS") {
      throw new PngError("PNG tRNS transparency is not supported");
    } else if (chunk.type === "IEND") {
      ended = true;
      break;
    }
  }
  if (!header) throw new PngError("IHDR is missing");
  if (!ended) throw new PngError("IEND is missing");
  if (header.bitDepth !== 8) {
    throw new PngError(`PNG bit depth ${header.bitDepth} is not supported (8 only)`);
  }
  if (!(header.colorType in CHANNELS)) {
    throw new PngError(
      `PNG colour type ${header.colorType} is not supported (greyscale, RGB or RGBA)`,
    );
  }
  if (header.compression !== 0) throw new PngError("PNG compression method is not supported");
  if (header.filter !== 0) throw new PngError("PNG filter method is not supported");
  if (header.interlace !== 0) throw new PngError("interlaced PNG is not supported");
  if (header.width === 0 || header.height === 0) throw new PngError("PNG has no pixels");
  if (idat.length === 0) throw new PngError("PNG has no image data");

  const channels = CHANNELS[header.colorType];
  const stride = header.width * channels;
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat));
  } catch (error) {
    throw new PngError(`PNG image data would not inflate: ${error.message}`);
  }
  if (raw.length !== header.height * (stride + 1)) {
    throw new PngError(
      `PNG image data is ${raw.length} bytes, expected ${header.height * (stride + 1)}`,
    );
  }

  const data = new Uint8Array(stride * header.height);
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const row = y * (stride + 1) + 1;
    const out = y * stride;
    const prev = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[row + x];
      const left = x >= channels ? data[out + x - channels] : 0;
      const up = y > 0 ? data[prev + x] : 0;
      const upLeft = y > 0 && x >= channels ? data[prev + x - channels] : 0;
      let decoded;
      switch (filter) {
        case 0:
          decoded = value;
          break;
        case 1:
          decoded = value + left;
          break;
        case 2:
          decoded = value + up;
          break;
        case 3:
          decoded = value + ((left + up) >> 1);
          break;
        case 4:
          decoded = value + paeth(left, up, upLeft);
          break;
        default:
          throw new PngError(`PNG row ${y} uses filter ${filter}, which is not valid`);
      }
      data[out + x] = decoded & 0xff;
    }
  }

  return {
    width: header.width,
    height: header.height,
    channels,
    colorType: header.colorType,
    format: TYPE_NAMES[header.colorType],
    data,
  };
}

function chunk(type, data) {
  const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typed.copy(out, 4);
  out.writeUInt32BE(crc32(typed), 8 + data.length);
  return out;
}

export function encodePng(image) {
  const { width, height, data } = image;
  const channels = image.channels ?? (image.colorType === 6 ? 4 : image.colorType === 2 ? 3 : 1);
  if (!(channels in { 1: 1, 3: 1, 4: 1 })) {
    throw new PngError(`cannot write ${channels} channels; use 1, 3 or 4`);
  }
  if (data.length !== width * height * channels) {
    throw new PngError(
      `pixel data is ${data.length} bytes, expected ${width * height * channels}`,
    );
  }
  const colorType = channels === 1 ? 0 : channels === 3 ? 2 : 6;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function toRGBA(image) {
  if (image.channels === 4) return image;
  const pixels = image.width * image.height;
  const data = new Uint8Array(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    if (image.channels === 1) {
      const v = image.data[i];
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    } else {
      data[i * 4] = image.data[i * 3];
      data[i * 4 + 1] = image.data[i * 3 + 1];
      data[i * 4 + 2] = image.data[i * 3 + 2];
      data[i * 4 + 3] = 255;
    }
  }
  return { width: image.width, height: image.height, channels: 4, data };
}

// Relative luminance (Rec. 709 coefficients) in the 0..255 range, one value per
// pixel. RGBA is composited over white, which is what a printed page shows.
export function luminance(image) {
  const rgba = image.channels === 4 ? image : toRGBA(image);
  const pixels = rgba.width * rgba.height;
  const out = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i += 1) {
    const r = rgba.data[i * 4];
    const g = rgba.data[i * 4 + 1];
    const b = rgba.data[i * 4 + 2];
    const a = rgba.data[i * 4 + 3] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    out[i] = Math.round(lum * a + 255 * (1 - a));
  }
  return { width: image.width, height: image.height, data: out };
}

export function grayscalePng(image) {
  return encodePng({ width: image.width, height: image.height, channels: 1, data: luminance(image).data });
}
