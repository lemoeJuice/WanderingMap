import { sharePackageSchema, type SharePackage } from './sharePackage'

export const SHARE_URL_MAX_LENGTH = 16_000

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return transform(bytes, new CompressionStream('gzip'))
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return transform(bytes, new DecompressionStream('gzip'))
}

async function transform(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const output = new Response(stream.readable).arrayBuffer()
  const writer = stream.writable.getWriter()
  await writer.write(bytes as BufferSource)
  await writer.close()
  return new Uint8Array(await output)
}

export async function encodeSharePackage(value: SharePackage): Promise<string> {
  const serialized = new TextEncoder().encode(
    JSON.stringify(sharePackageSchema.parse(value)),
  )
  let payload: string
  if ('CompressionStream' in globalThis) {
    payload = `g${toBase64Url(await gzip(serialized))}`
  } else {
    payload = `j${toBase64Url(serialized)}`
  }
  const url = new URL(window.location.href)
  url.pathname = '/share'
  url.search = ''
  url.hash = `data=${payload}`
  if (url.toString().length > SHARE_URL_MAX_LENGTH) {
    throw new Error(
      'This share is too large for a URL. Export a .wander.json archive instead.',
    )
  }
  return url.toString()
}

export async function decodeShareFragment(hash: string): Promise<SharePackage> {
  const encoded = new URLSearchParams(hash.replace(/^#/, '')).get('data')
  if (!encoded || encoded.length < 2)
    throw new Error('This share link does not contain a Wander Map package.')
  const bytes = fromBase64Url(encoded.slice(1))
  const decoded = encoded.startsWith('g')
    ? await gunzip(bytes)
    : encoded.startsWith('j')
      ? bytes
      : undefined
  if (!decoded) throw new Error('This share link uses an unsupported encoding.')
  const json = new TextDecoder().decode(decoded)
  return sharePackageSchema.parse(JSON.parse(json))
}
