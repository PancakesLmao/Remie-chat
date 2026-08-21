import { useState, useEffect } from "preact/hooks";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { saveApiKey, deleteApiKey, getProviders } from "../stronghold";
import { Check, X, Eye, EyeOff, Trash2, ArrowLeft } from "lucide-preact";
import ConfirmDialog from "../components/ConfirmDialog";
import Loading from "../components/Loading.jsx";
import { fetchAndCacheModels } from "../api/models.js";

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

function SaveableInput({ label, type = "text", value, placeholder, onSave, min, max, hint, onDirtyChange }) {
  const [current, setCurrent] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setCurrent(value);
    setDirty(false);
  }, [value]);

  useEffect(() => {
    if (onDirtyChange) onDirtyChange(dirty);
  }, [dirty]);

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

function SaveableBirthday({ label, value, onSave, onDirtyChange }) {
  const [current, setCurrent] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setCurrent(value);
    setDirty(false);
  }, [value]);

  useEffect(() => {
    if (onDirtyChange) onDirtyChange(dirty);
  }, [dirty]);

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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: '#9a8a96', fontWeight: 600 }}>Month</span>
          <select value={current.month} onChange={(e) => handleChange("month", e)}>
            <option value="">-</option>
            {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: '#9a8a96', fontWeight: 600 }}>Day</span>
          <select value={current.day} onChange={(e) => handleChange("day", e)}>
            <option value="">-</option>
            {days.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: '#9a8a96', fontWeight: 600 }}>Year</span>
          <select value={current.year} onChange={(e) => handleChange("year", e)}>
            <option value="">-</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      {dirty && (
        <div class="input-actions" style={{ marginTop: '8px', justifyContent: 'flex-end' }}>
          <button class="icon-btn tick-btn" onClick={() => { onSave(current); setDirty(false); }} title="Save">
            <Check size={16} />
          </button>
          <button class="icon-btn cancel-btn" onClick={() => { setCurrent(value); setDirty(false); }} title="Cancel">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ApiKeyInput ──────────────────────────────────────────────────────────────

function ApiKeyInput({ provider, hasKey, onSave, onDelete, onDirtyChange }) {
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const isDirty = draft.trim().length > 0;
  useEffect(() => {
    if (onDirtyChange) onDirtyChange(isDirty);
  }, [isDirty]);

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

// Removed PROVIDER_MODELS - Now dynamically fetched via models.js

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export default function SettingsPage({ onClose }) {
  const [store, setStore] = useState(null);

  // Config state (stored in plugin-store)
  const [userName, setUserName] = useState("Manager");
  const [birthday, setBirthday] = useState({ day: "", month: "", year: "" });
  const [activeProvider, setActiveProvider] = useState("openai");
  const [activeModel, setActiveModel] = useState("gpt-4o");
  const [temperature, setTemperature] = useState(1.0);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [showTokenCount, setShowTokenCount] = useState(false);
  const [mascotModeAction, setMascotModeAction] = useState("mascot");
  const [providerModels, setProviderModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [loadingText] = useState("Loading...");

  // Stronghold presence flags (booleans only, no key values)
  const [providers, setProviders] = useState({ openai: false, claude: false, gemini: false, groq: false });

  const [toastMsg, setToastMsg] = useState("Saved!");
  const [toastVisible, setToastVisible] = useState(false);
  const [toastIsError, setToastIsError] = useState(false);

  const [dirtyFields, setDirtyFields] = useState(new Set());
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  const handleDirty = (id, isDirty) => {
    setDirtyFields((prev) => {
      const next = new Set(prev);
      if (isDirty) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent) || (window.__TAURI_INTERNALS__ && ["android", "ios"].includes(window.__TAURI_INTERNALS__.platform));

  const handleClose = () => {
    if (dirtyFields.size > 0) {
      setShowConfirmClose(true);
    } else {
      if (onClose) onClose();
    }
  };

  const forceClose = () => {
    setShowConfirmClose(false);
    if (onClose) onClose();
  };

  const showToast = (msg = "Saved!", err = false) => {
    setToastMsg(msg);
    setToastIsError(err);
    setToastVisible(true);
  };

  // ── Load config from plugin-store on mount ──
  useEffect(() => {
    const init = async () => {
      try {
        let name = "Manager", bday = { day: "", month: "", year: "" }, provider = "openai", model = "gpt-4o", temp = 1.0, tokens = 2048, showTokens = false, mascotMode = "mascot";

        if (isMobile) {
          name = localStorage.getItem("remie_config_userName") ?? name;
          const bdayStr = localStorage.getItem("remie_config_birthday");
          if (bdayStr) bday = JSON.parse(bdayStr);
          provider = localStorage.getItem("remie_config_activeProvider") ?? provider;
          model = localStorage.getItem("remie_config_activeModel") ?? model;
          const tempStr = localStorage.getItem("remie_config_temperature");
          if (tempStr) temp = parseFloat(tempStr);
          const tkStr = localStorage.getItem("remie_config_maxTokens");
          if (tkStr) tokens = parseInt(tkStr, 10);
          const stStr = localStorage.getItem("remie_config_showTokenCount");
          if (stStr) showTokens = stStr === "true";
          mascotMode = localStorage.getItem("remie_config_mascotModeAction") ?? mascotMode;
        } else {
          const s = await load("config.json", { autoSave: true });
          setStore(s);
          name = await s.get("userName") ?? name;
          bday = await s.get("birthday") ?? bday;
          provider = await s.get("activeProvider") ?? provider;
          model = await s.get("activeModel") ?? model;
          temp = await s.get("temperature") ?? temp;
          tokens = await s.get("maxTokens") ?? tokens;
          showTokens = await s.get("showTokenCount") ?? showTokens;
          mascotMode = await s.get("mascotModeAction") ?? mascotMode;
        }

        setUserName(name);
        setBirthday(bday);
        setActiveProvider(provider);
        setActiveModel(model);
        setTemperature(temp);
        setMaxTokens(tokens);
        setShowTokenCount(showTokens);
        setMascotModeAction(mascotMode);
        
        // Fetch models for active provider
        const models = await fetchAndCacheModels(provider);
        setProviderModels(models);
      } catch (err) {
        console.error("Failed to load store in settings:", err);
      }

      // Load key presence from Stronghold (boolean flags only)
      refreshProviders();
    };
    init();
  }, []);

  const refreshProviders = async () => {
    try {
      const result = await getProviders();
      setProviders(result);
    } catch (e) {
      console.error("getProviders failed:", e);
    }
  };

  // ── Store setters ──
  const saveToStore = async (key, value) => {
    if (isMobile) {
      if (typeof value === "object") {
        localStorage.setItem("remie_config_" + key, JSON.stringify(value));
      } else {
        localStorage.setItem("remie_config_" + key, String(value));
      }
    } else {
      if (!store) return;
      await store.set(key, value);
      await store.save();
    }
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
    
    setIsLoadingModels(true);
    
    const models = await fetchAndCacheModels(p);
    setProviderModels(models);
    
    let defaultModel = models.length > 0 ? models[0] : "";
    if (models.includes(activeModel)) {
      defaultModel = activeModel; // keep current if exists
    }
    
    setActiveModel(defaultModel);
    await saveToStore("activeProvider", p);
    await saveToStore("activeModel", defaultModel);
    await emit("config:updated", { activeProvider: p, activeModel: defaultModel, temperature, maxTokens });
    
    setIsLoadingModels(false);
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
    await emit("config:updated", { activeProvider, activeModel, temperature, maxTokens: parsed, showTokenCount });
    showToast();
  };

  const handleToggleTokenCount = async () => {
    const next = !showTokenCount;
    setShowTokenCount(next);
    await saveToStore("showTokenCount", next);
    await emit("config:updated", { showTokenCount: next });
  };

  const handleMascotModeChange = async (e) => {
    const val = e.target.value;
    setMascotModeAction(val);
    await saveToStore("mascotModeAction", val);
    await emit("config:updated", { mascotModeAction: val });
  };

  // ── Stronghold key actions ──
  const handleSaveKey = async (provider, key) => {
    try {
      await saveApiKey(provider.toLowerCase(), key);
      await refreshProviders();
      showToast("Key saved securely!");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleDeleteKey = async (provider) => {
    try {
      await deleteApiKey(provider.toLowerCase());
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
        <button class="icon-btn cancel-btn" onClick={handleClose} title="Back to Chat">
          <ArrowLeft size={18} />
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
            onDirtyChange={(d) => handleDirty("userName", d)}
          />
          <SaveableBirthday
            label="Birthday"
            value={birthday}
            onSave={handleSaveBirthday}
            onDirtyChange={(d) => handleDirty("birthday", d)}
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
                {(providerModels || []).map((m) => (
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
            onDirtyChange={(d) => handleDirty(`key_${activeProvider}`, d)}
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
            value={maxTokens}
            min={100}
            max={8192}
            hint="Max tokens in the response."
            onSave={handleSaveMaxTokens}
            onDirtyChange={(d) => handleDirty("maxTokens", d)}
          />

          <div class="settings-section-title">Interface</div>
          
          <div class="setting-item">
            <label>Mascot Mode Display</label>
            <div class="input-row">
              <select value={mascotModeAction} onChange={handleMascotModeChange}>
                <option value="mascot">Show Floating Mascot</option>
                <option value="taskbar">Minimize to Taskbar</option>
              </select>
            </div>
            <div class="settings-hint">Choose what happens when you click the minimize icon.</div>
          </div>

          <div class="setting-item" style={{ cursor: "pointer", userSelect: "none" }} onClick={handleToggleTokenCount}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ cursor: "pointer", margin: 0 }}>Show Token Count</label>
              <label class="toggle-switch" style={{ pointerEvents: 'none' }}>
                <input type="checkbox" checked={showTokenCount} readOnly />
                <span class="toggle-track" />
                <span class="toggle-thumb" />
              </label>
            </div>
            <div class="settings-hint">Display the total tokens used below the AI's chat bubble.</div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        visible={showConfirmClose}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to close without saving?"
        confirmText="Close Without Saving"
        cancelText="Cancel"
        onConfirm={forceClose}
        onCancel={() => setShowConfirmClose(false)}
      />

      <Toast message={toastMsg} visible={toastVisible} isError={toastIsError} onHide={() => setToastVisible(false)} />
      {isLoadingModels && <Loading text={loadingText} />}
    </div>
  );
}
