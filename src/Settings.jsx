import { useState, useEffect } from "preact/hooks";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check, X } from "lucide-preact";

function Toast({ message, visible, onHide }) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        onHide();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [visible, onHide]);

  return (
    <div class={`toast-container ${visible ? 'show' : ''}`}>
      {message}
    </div>
  );
}

function SaveableInput({ label, type = "text", value, placeholder, onSave }) {
  const [currentValue, setCurrentValue] = useState(value);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setCurrentValue(value);
    setIsDirty(false);
  }, [value]);

  const handleInput = (e) => {
    setCurrentValue(e.target.value);
    setIsDirty(e.target.value !== value);
  };

  const handleSave = () => {
    onSave(currentValue);
    setIsDirty(false);
  };

  const handleCancel = () => {
    setCurrentValue(value);
    setIsDirty(false);
  };

  return (
    <div class="setting-item">
      <label>{label}</label>
      <div class="input-row">
        <input
          type={type}
          value={currentValue}
          onInput={handleInput}
          placeholder={placeholder}
        />
        {isDirty && (
          <div class="input-actions">
            <button class="icon-btn tick-btn" onClick={handleSave} title="Save">
              <Check size={16} />
            </button>
            <button class="icon-btn cancel-btn" onClick={handleCancel} title="Cancel">
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SaveableBirthday({ label, value, onSave }) {
  const [currentValue, setCurrentValue] = useState(value);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setCurrentValue(value);
    setIsDirty(false);
  }, [value]);

  const handleChange = (field, e) => {
    const newVal = { ...currentValue, [field]: e.target.value };
    setCurrentValue(newVal);
    setIsDirty(newVal.day !== value.day || newVal.month !== value.month || newVal.year !== value.year);
  };

  const handleSave = () => {
    onSave(currentValue);
    setIsDirty(false);
  };

  const handleCancel = () => {
    setCurrentValue(value);
    setIsDirty(false);
  };

  const days = Array.from({length: 31}, (_, i) => i + 1);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentYear = new Date().getFullYear();
  const years = Array.from({length: 100}, (_, i) => currentYear - i);

  return (
    <div class="setting-item">
      <label>{label}</label>
      <div class="input-row">
        <select value={currentValue.month} onChange={(e) => handleChange('month', e)}>
          <option value="">Month</option>
          {months.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
        </select>
        <select value={currentValue.day} onChange={(e) => handleChange('day', e)}>
          <option value="">Day</option>
          {days.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={currentValue.year} onChange={(e) => handleChange('year', e)}>
          <option value="">Year</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {isDirty && (
          <div class="input-actions">
            <button class="icon-btn tick-btn" onClick={handleSave} title="Save">
              <Check size={16} />
            </button>
            <button class="icon-btn cancel-btn" onClick={handleCancel} title="Cancel">
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [userName, setUserName] = useState("Manager");
  const [birthday, setBirthday] = useState({ day: "", month: "", year: "" });
  const [apiKey, setApiKey] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  const handleSaveField = (setter) => (newValue) => {
    setter(newValue);
    // In a real app, save to tauri store or localStorage here
    setToastVisible(true);
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
          <div class="settings-section-title">Profile</div>
          <SaveableInput
            label="User Name"
            value={userName}
            onSave={handleSaveField(setUserName)}
            placeholder="Enter your name..."
          />
          <SaveableBirthday
            label="Birthday"
            value={birthday}
            onSave={handleSaveField(setBirthday)}
          />
          
          <div class="settings-section-title" style={{marginTop: '16px'}}>API Configuration</div>
          <SaveableInput
            label="API Key"
            type="password"
            value={apiKey}
            onSave={handleSaveField(setApiKey)}
            placeholder="sk-..."
          />
        </div>
      </div>
      <Toast message="Saved!" visible={toastVisible} onHide={() => setToastVisible(false)} />
    </div>
  );
}
