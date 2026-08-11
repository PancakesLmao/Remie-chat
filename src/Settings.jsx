import { useState, useEffect } from "preact/hooks";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { Check, X, Eye, EyeOff, Trash2 } from "lucide-preact";

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, visible, onHide, isError = false }) {
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onHide, isError ? 5000 : 2500);
      return () => clearTimeout(t);
    }
  }, [visible, onHide, isError]);

  return <div class={`toast-container ${visible ? "show" : ""} ${isError ? "toast-error" : ""}`}>{message}</div>;
}

// ─── SaveableInput ────────────────────────────────────────────────────────────

function SaveableInput({ label, type = "text", value, placeholder, onSave, min, max, hint }) {
  const [current, setCurrent] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setCurrent(value);
    setDirty(false);
  }, [value]);

  const handleInput = (e) => {
    setCurrent(e.target.value);
    setDirty(String(e.target.value) !== String(value));
  };

  return (
    <div class="setting-item">
      <label>{label}</label>
      <div class="input-row">
        <input type={type} value={current} onInput={handleInput} placeholder={placeholder} min={min} max={max} />
        {dirty && (
          <div class="input-actions">
            <button class="icon-btn tick-btn" onClick={() => { onSave(current); setDirty(false); }} title="Save">
              <Check size={16} />
            </button>
            <button class="icon-btn cancel-btn" onClick={() => { setCurrent(value); setDirty(false); }} title="Cancel">
              <X size={16} />
            </button>
          </div>
        )}
      </div>
      {hint && <div class="settings-hint">{hint}</div>}
    </div>
  );
}

// ─── SaveableBirthday ─────────────────────────────────────────────────────────

function SaveableBirthday({ label, value, onSave }) {
  const [current, setCurrent] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setCurrent(value);
    setDirty(false);
  }, [value]);

  const handleChange = (field, e) => {
    const next = { ...current, [field]: e.target.value };
    setCurrent(next);
    setDirty(next.day !== value.day || next.month !== value.month || next.year !== value.year);
  };

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const years = Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div class="setting-item">
      <label>{label}</label>
      <div class="input-row">
        <select value={current.month} onChange={(e) => handleChange("month", e)}>
          <option value="">Month</option>
          {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={current.day} onChange={(e) => handleChange("day", e)}>
          <option value="">Day</option>
          {days.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={current.year} onChange={(e) => handleChange("year", e)}>
          <option value="">Year</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {dirty && (
          <div class="input-actions">
            <button class="icon-btn tick-btn" onClick={() => { onSave(current); setDirty(false); }} title="Save">
              <Check size={16} />
            </button>
            <button class="icon-btn cancel-btn" onClick={() => { setCurrent(value); setDirty(false); }} title="Cancel">
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ApiKeyInput ──────────────────────────────────────────────────────────────

function ApiKeyInput({ provider, hasKey, onSave, onDelete }) {
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    await onSave(draft.trim());
    setDraft("");
    setSaving(false);
  };

  return (
    <div class="setting-item">
      <label>
        {provider} API Key&nbsp;
        {hasKey ? (
          <span class="key-badge key-set">
            <Check size={12} style={{ marginRight: '2px', marginTop: '-2px' }} /> saved
          </span>
        ) : (
          <span class="key-badge key-unset">not set</span>
        )}
      </label>
      <div class="input-row">
        <input
          type={show ? "text" : "password"}
          value={draft}
          onInput={(e) => setDraft(e.target.value)}
          placeholder={hasKey ? "Enter new key to replace..." : "Paste key here..."}
        />
        <div class="input-actions">
          <button class="icon-btn" onClick={() => setShow((s) => !s)} title={show ? "Hide" : "Show"}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          {draft.trim() && (
            <button class="icon-btn tick-btn" onClick={handleSave} disabled={saving} title="Save key">
              <Check size={16} />
            </button>
          )}
          {hasKey && (
            <button class="icon-btn cancel-btn" onClick={onDelete} title="Remove key">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Models per provider ──────────────────────────────────────────────────────

const PROVIDER_MODELS = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  claude: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
  gemini: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"],
  groq:   ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3-32b", "groq/compound", "groq/compound-mini"],
};

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [store, setStore] = useState(null);

  // Config state (stored in plugin-store)
  const [userName, setUserName] = useState("Manager");
  const [birthday, setBirthday] = useState({ day: "", month: "", year: "" });
  const [activeProvider, setActiveProvider] = useState("openai");
  const [activeModel, setActiveModel] = useState("gpt-4o");
  const [temperature, setTemperature] = useState(1.0);
  const [maxTokens, setMaxTokens] = useState(2048);

  // Stronghold presence flags (booleans only, no key values)
  const [providers, setProviders] = useState({ openai: false, claude: false, gemini: false, groq: false });

  const [toastMsg, setToastMsg] = useState("Saved!");
  const [toastVisible, setToastVisible] = useState(false);
  const [toastIsError, setToastIsError] = useState(false);

  const showToast = (msg = "Saved!", isError = false) => {
    setToastMsg(msg);
    setToastIsError(isError);
    setToastVisible(true);
  };

  // ── Load config from plugin-store on mount ──
  useEffect(() => {
    const init = async () => {
      const s = await load("config.json", { autoSave: true });
      setStore(s);

      const name = await s.get("userName") ?? "Manager";
      const bday = await s.get("birthday") ?? { day: "", month: "", year: "" };
      const provider = await s.get("activeProvider") ?? "openai";
      const model = await s.get("activeModel") ?? "gpt-4o";
      const temp = await s.get("temperature") ?? 1.0;
      const tokens = await s.get("maxTokens") ?? 2048;

      setUserName(name);
      setBirthday(bday);
      setActiveProvider(provider);
      setActiveModel(model);
      setTemperature(temp);
      setMaxTokens(tokens);

      // Load key presence from Stronghold (boolean flags only)
      refreshProviders();
    };
    init();
  }, []);

  const refreshProviders = async () => {
    try {
      const result = await invoke("get_providers");
      setProviders(result);
    } catch (e) {
      console.error("get_providers failed:", e);
    }
  };

  // ── Store setters ──
  const saveToStore = async (key, value) => {
    if (!store) return;
    await store.set(key, value);
    await store.save();
  };

  const handleSaveUserName = async (val) => {
    setUserName(val);
    await saveToStore("userName", val);
    await emit("profile:updated", { userName: val, birthday });
    showToast();
  };

  const handleSaveBirthday = async (val) => {
    setBirthday(val);
    await saveToStore("birthday", val);
    await emit("profile:updated", { userName, birthday: val });
    showToast();
  };

  const handleProviderChange = async (e) => {
    const p = e.target.value;
    setActiveProvider(p);
    const defaultModel = PROVIDER_MODELS[p][0];
    setActiveModel(defaultModel);
    await saveToStore("activeProvider", p);
    await saveToStore("activeModel", defaultModel);
    await emit("config:updated", { activeProvider: p, activeModel: defaultModel, temperature, maxTokens });
  };

  const handleModelChange = async (e) => {
    const m = e.target.value;
    setActiveModel(m);
    await saveToStore("activeModel", m);
    await emit("config:updated", { activeProvider, activeModel: m, temperature, maxTokens });
  };

  const handleTemperatureChange = async (e) => {
    const val = parseFloat(e.target.value);
    setTemperature(val);
    await saveToStore("temperature", val);
    await emit("config:updated", { activeProvider, activeModel, temperature: val, maxTokens });
  };

  const handleSaveMaxTokens = async (val) => {
    let parsed = parseInt(val, 10);
    if (isNaN(parsed) || parsed < 1) parsed = 2048;
    setMaxTokens(parsed);
    await saveToStore("maxTokens", parsed);
    await emit("config:updated", { activeProvider, activeModel, temperature, maxTokens: parsed });
    showToast();
  };

  // ── Stronghold key actions ──
  const handleSaveKey = async (provider, key) => {
    try {
      await invoke("save_api_key", { provider, key });
      await refreshProviders();
      showToast("Key saved securely!");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleDeleteKey = async (provider) => {
    try {
      await invoke("delete_api_key", { provider });
      await refreshProviders();
      showToast("Key removed.");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  return (
    <div id="settings-root">
      <div class="settings-header" data-tauri-drag-region>
        <div class="settings-title" data-tauri-drag-region>Settings</div>
        <button class="icon-btn cancel-btn" onClick={() => getCurrentWindow().hide()} title="Close Settings">
          <X size={18} />
        </button>
      </div>

      <div class="settings-view standalone">
        <div class="settings-body">

          {/* Profile */}
          <div class="settings-section-title">Profile</div>
          <SaveableInput
            label="User Name"
            value={userName}
            onSave={handleSaveUserName}
            placeholder="Enter your name..."
          />
          <SaveableBirthday
            label="Birthday"
            value={birthday}
            onSave={handleSaveBirthday}
          />

          <div class="settings-section-title">AI Provider</div>
          <div class="setting-item">
            <label>Provider</label>
            <div class="input-row">
              <select value={activeProvider} onChange={handleProviderChange}>
                <option value="openai">OpenAI</option>
                <option value="claude">Claude (Anthropic)</option>
                <option value="gemini">Gemini (Google)</option>
                <option value="groq">Groq</option>
              </select>
            </div>
          </div>
          <div class="setting-item">
            <label>Model</label>
            <div class="input-row">
              <select value={activeModel} onChange={handleModelChange}>
                {(PROVIDER_MODELS[activeProvider] ?? []).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <ApiKeyInput
            provider={activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1)}
            hasKey={providers[activeProvider]}
            onSave={(key) => handleSaveKey(activeProvider, key)}
            onDelete={() => handleDeleteKey(activeProvider)}
          />

          <div class="settings-section-title">Generation</div>
          <div class="setting-item">
            <label>Temperature <span class="settings-hint">{temperature.toFixed(1)}</span></label>
            <div class="input-row">
              <input
                type="range" min="0" max="2" step="0.1"
                value={temperature}
                onInput={handleTemperatureChange}
                style={{ width: "100%" }}
              />
            </div>
            <div class="settings-hint" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Precise (0)</span><span>Balanced (1)</span><span>Creative (2)</span>
            </div>
          </div>
          <SaveableInput
            label="Max Tokens"
            type="number"
            min="1"
            max="32768"
            value={maxTokens}
            onSave={handleSaveMaxTokens}
            hint="Max tokens in the response."
          />
        </div>
      </div>

      <Toast message={toastMsg} visible={toastVisible} isError={toastIsError} onHide={() => setToastVisible(false)} />
    </div>
  );
}
