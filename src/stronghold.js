import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { load as storeLoad } from '@tauri-apps/plugin-store';

let strongholdInstance = null;
let storeInstance = null;
let mobileStore = null;

const isMobile = /Android|webOS|iPhone|iPad/i.test(navigator.userAgent) || (window.__TAURI_INTERNALS__ && ["android", "ios"].includes(window.__TAURI_INTERNALS__.platform));

// --- WebCrypto Obfuscation for Mobile LocalStorage ---
// This provides basic obfuscation to prevent trivial plaintext viewing in DevTools.
// It is NOT secure against a determined attacker with device access.
const OBFUSCATION_PASS = "remie-chat-obfuscation-pass";

async function getObfuscationKey() {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(OBFUSCATION_PASS),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("remie-salt"),
      iterations: 10000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(text) {
  if (!text) return text;
  const key = await getObfuscationKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(text)
  );
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode.apply(null, result));
}

async function decryptData(base64) {
  if (!base64) return null;
  try {
    const key = await getObfuscationKey();
    const binary = atob(base64);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      data[i] = binary.charCodeAt(i);
    }
    const iv = data.slice(0, 12);
    const encrypted = data.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // console.warn("[Keys] Failed to decrypt API key, returning null");
    return null;
  }
}
// -----------------------------------------------------

async function getStore() {
  if (isMobile) {
    if (mobileStore) return mobileStore;
    mobileStore = {
      set: async (key, val) => {
        const encrypted = await encryptData(val);
        localStorage.setItem(`remie_api_${key}`, encrypted);
      },
      get: async (key) => {
        const encrypted = localStorage.getItem(`remie_api_${key}`);
        if (!encrypted) return null;
        return await decryptData(encrypted);
      },
      delete: async (key) => localStorage.removeItem(`remie_api_${key}`),
      save: async () => {}, 
    };
    return mobileStore;
  }

  if (storeInstance) return storeInstance;

  try {
    // console.log("[Stronghold] Initializing Stronghold...");
    const { Stronghold } = await import('@tauri-apps/plugin-stronghold');
    // console.log("[Stronghold] Resolving vault path...");
    const vaultPath = await join(await appLocalDataDir(), '.remie-keys.hold');
    // console.log("[Stronghold] Vault path resolved to:", vaultPath);

    const password = "remie-local-secure-pass"; // OS handles at-rest encryption
    
    // console.log("[Stronghold] Loading vault at:", vaultPath);
    strongholdInstance = await Stronghold.load(vaultPath, password);
    // console.log("[Stronghold] Vault loaded successfully.");
    
    let client;
    try {
      // console.log("[Stronghold] Loading client 'main'...");
      client = await strongholdInstance.loadClient("main");
      // console.log("[Stronghold] Client 'main' loaded.");
    } catch (e) {
      // console.log("[Stronghold] Client 'main' not found, creating new...");
      client = await strongholdInstance.createClient("main");
      // console.log("[Stronghold] Client 'main' created.");
    }
    storeInstance = client.getStore();
    // console.log("[Stronghold] Initialization complete.");
    return storeInstance;
  } catch (err) {
    console.error("[Stronghold] FATAL ERROR during initialization:", err);
    throw err;
  }
}

// Eagerly initialize Stronghold on module load to avoid freezing when user first inputs key
getStore().catch(console.error);

export async function saveApiKey(provider, key) {
  const store = await getStore();
  if (isMobile) {
    await store.set(provider, key);
    await store.save();
  } else {
    const data = Array.from(new TextEncoder().encode(key));
    await store.insert(provider, data);
    await strongholdInstance.save();
  }
}

export async function getApiKey(provider) {
  const store = await getStore();
  if (isMobile) {
    return await store.get(provider) || null;
  } else {
    const data = await store.get(provider);
    if (!data) return null;
    return new TextDecoder().decode(new Uint8Array(data));
  }
}

export async function deleteApiKey(provider) {
  const store = await getStore();
  if (isMobile) {
    await store.delete(provider);
    await store.save();
  } else {
    await store.remove(provider);
    await strongholdInstance.save();
  }
}

export async function hasApiKey(provider) {
  const key = await getApiKey(provider);
  return !!key;
}

export async function getProviders() {
  return {
    openai: await hasApiKey("openai"),
    claude: await hasApiKey("claude"),
    gemini: await hasApiKey("gemini"),
    groq: await hasApiKey("groq"),
  };
}
