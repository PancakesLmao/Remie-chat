import { fetch } from '@tauri-apps/plugin-http';
import { load as storeLoad } from '@tauri-apps/plugin-store';
import { getApiKey } from './stronghold';

export const FALLBACK_MODELS = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  claude: ["claude-sonnet-4-5", "claude-haiku-4-5"],
  gemini: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"],
  groq:   [
    "groq/compound",
    "groq/compound-mini",
    "qwen/qwen3.6-27b",
    "whisper-large-v3-turbo"
  ],
};

let storeInstance = null;
async function getStore() {
  if (!storeInstance) storeInstance = await storeLoad('config.json', { autoSave: true });
  return storeInstance;
}

export async function fetchAndCacheModels(provider) {
  const store = await getStore();
  const cacheKey = `cached_models_${provider}`;
  const fallback = FALLBACK_MODELS[provider] || [];

  // Check for API key first
  const apiKey = await getApiKey(provider);
  if (!apiKey) {
    // If no key is set yet, return cached or fallback list
    const cached = await store.get(cacheKey);
    return cached || fallback;
  }

  try {
    let url = "";
    let headers = {};

    if (provider === "openai") {
      url = "https://api.openai.com/v1/models";
      headers = { "Authorization": `Bearer ${apiKey}` };
    } else if (provider === "groq") {
      url = "https://api.groq.com/openai/v1/models";
      headers = { "Authorization": `Bearer ${apiKey}` };
    } else if (provider === "gemini") {
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    } else if (provider === "claude") {
      // Anthropic's dynamic endpoint is highly restrictive and includes internal models
      // We will stick to the curated fallback list
      return fallback;
    } else {
      return fallback;
    }

    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
      console.warn(`[models] Fetch failed for ${provider} with status: ${response.status}`);
      const cached = await store.get(cacheKey);
      return cached || fallback;
    }

    const json = await response.json();
    let models = [];

    if (provider === "openai" || provider === "groq") {
      if (json.data && Array.isArray(json.data)) {
        models = json.data.map(m => m.id);
      }
    } else if (provider === "gemini") {
      if (json.models && Array.isArray(json.models)) {
        models = json.models.map(m => m.name.replace("models/", ""));
      }
    }

    if (models.length > 0) {
      // Sort models alphabetically to make dropdown easier to read
      models.sort((a, b) => a.localeCompare(b));
      
      // Cache for future
      await store.set(cacheKey, models);
      await store.save();
      return models;
    }

    return fallback;
  } catch (err) {
    console.error(`[models] Network error fetching ${provider} models:`, err);
    const cached = await store.get(cacheKey);
    return cached || fallback;
  }
}
