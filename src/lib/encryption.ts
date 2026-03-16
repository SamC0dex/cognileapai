/**
 * Server-side AES-256-GCM encryption for API keys
 * Keys are encrypted before storage and only decrypted server-side during AI calls
 */

// Use Web Crypto API (available in Edge Runtime and Node.js)
const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12 // 96 bits recommended for GCM
const TAG_LENGTH = 128 // bits

function getEncryptionKey(): string {
  const key = process.env.API_KEYS_ENCRYPTION_KEY
  if (!key) {
    throw new Error(
      'API_KEYS_ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32'
    )
  }
  if (key.length !== 64) {
    throw new Error(
      'API_KEYS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32'
    )
  }
  return key
}

async function importKey(hexKey: string): Promise<CryptoKey> {
  const keyBuffer = hexToBuffer(hexKey)
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes.buffer
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Encrypt an API key for storage
 * Returns: iv:ciphertext (both hex-encoded)
 */
export async function encryptApiKey(plaintext: string): Promise<string> {
  const encKey = getEncryptionKey()
  const key = await importKey(encKey)

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    encoded
  )

  return bufferToHex(iv.buffer) + ':' + bufferToHex(ciphertext)
}

/**
 * Decrypt an API key from storage
 * Input: iv:ciphertext (both hex-encoded)
 */
export async function decryptApiKey(encrypted: string): Promise<string> {
  const encKey = getEncryptionKey()
  const key = await importKey(encKey)

  const [ivHex, ciphertextHex] = encrypted.split(':')
  if (!ivHex || !ciphertextHex) {
    throw new Error('Invalid encrypted key format')
  }

  const iv = new Uint8Array(hexToBuffer(ivHex))
  const ciphertext = hexToBuffer(ciphertextHex)

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    ciphertext
  )

  return new TextDecoder().decode(decrypted)
}

/**
 * Generate a hint from an API key (last 4 characters)
 */
export function generateKeyHint(apiKey: string): string {
  if (apiKey.length <= 4) return '****'
  return '...' + apiKey.slice(-4)
}
