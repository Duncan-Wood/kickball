const ALGORITHM = 'AES-GCM';
const INITIALIZATION_VECTOR_BYTES = 12;

function base64Decode(text) {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

function base64Encode(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

async function importKey(base64Key) {
  return crypto.subtle.importKey('raw', base64Decode(base64Key), ALGORITHM, false, ['encrypt', 'decrypt']);
}

export async function encryptToken(plainToken, base64Key) {
  const initializationVector = crypto.getRandomValues(new Uint8Array(INITIALIZATION_VECTOR_BYTES));
  const encrypted = await crypto.subtle.encrypt({ name: ALGORITHM, iv: initializationVector }, await importKey(base64Key), new TextEncoder().encode(plainToken));
  return `${base64Encode(initializationVector)}.${base64Encode(new Uint8Array(encrypted))}`;
}

export async function decryptToken(storedToken, base64Key) {
  const [initializationVector, encrypted] = storedToken.split('.').map(base64Decode);
  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv: initializationVector }, await importKey(base64Key), encrypted);
  return new TextDecoder().decode(decrypted);
}

export function newTeamSlug() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => alphabet[byte % alphabet.length]).join('');
}
