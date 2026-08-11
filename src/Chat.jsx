import { useState, useEffect, useRef } from "preact/hooks";
import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { Settings, Maximize2, Minimize2, Minus, AlertTriangle, Settings2, Info } from "lucide-preact";

// Assets
import remieGen from "./assets/remie_gen.gif";
import remieComplete from "./assets/remie_complete.gif";
import remieThinking from "./assets/remie_thinking.gif";
import remieWaiting from "./assets/remie_waiting_input.gif";
import userTyping from "./assets/user_typing.gif";

const STATE_LABELS = {
  waiting_input: 'waiting for you',
  typing: 'listening...',
  thinking: 'thinking...',
  generating: 'writing reply...',
  complete: 'done!'
};

// Models that support thinking / reasoning params
const THINKING_MODELS = new Set([
  // Groq reasoning models
  "openai/gpt-oss-120b", "openai/gpt-oss-20b",
  // Claude extended thinking
  "claude-opus-4-5", "claude-sonnet-4-5",
]);

export default function ChatApp() {
  const [mode, setMode] = useState("chatbox"); // 'chatbox' or 'widget'
  const [aiState, setAiState] = useState("waiting_input");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [userName, setUserName] = useState("Manager");
  const [activeProvider, setActiveProvider] = useState("openai");
  const [activeModel, setActiveModel] = useState("gpt-4o");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [temperature, setTemperature] = useState(1.0);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [thinkingEffort, setThinkingEffort] = useState("medium");
  const [thinkingPopoverOpen, setThinkingPopoverOpen] = useState(false);
  const thinkingBtnRef = useRef(null);
  const chatAreaRef = useRef(null);
  const streamingIdxRef = useRef(null); // index of the message being streamed

  // Load config from plugin-store on mount
  useEffect(() => {
    const isBirthday = (bday) => {
      if (!bday.month || !bday.day) return false;
      const today = new Date();
      return parseInt(bday.month) === today.getMonth() + 1 &&
             parseInt(bday.day) === today.getDate();
    };

    const initStore = async () => {
      const s = await load("config.json", { autoSave: false });
      const name = await s.get("userName") ?? "Manager";
      const bday = await s.get("birthday") ?? { day: "", month: "", year: "" };
      const provider = await s.get("activeProvider") ?? "openai";
      const model = await s.get("activeModel") ?? "gpt-4o";
      const temp = await s.get("temperature") ?? 1.0;
      const tokens = await s.get("maxTokens") ?? 2048;
      setUserName(name);
      setActiveProvider(provider);
      setActiveModel(model);
      setTemperature(temp);
      setMaxTokens(tokens);

      const greeting = isBirthday(bday)
        ? `Happy Birthday, ${name}! It's Remie~ Wishing you a wonderful day today!`
        : `hi ${name}, It's Remie~`;
      setMessages([{ role: "ai", text: greeting }]);
    };
    initStore();
  }, []);

  // Live update when Settings saves profile changes
  useEffect(() => {
    let unlisten;
    listen("profile:updated", (event) => {
      const { userName: newName } = event.payload;
      if (newName) setUserName(newName);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Live update when Settings changes provider, model, or gen params
  useEffect(() => {
    let unlisten;
    listen("config:updated", (event) => {
      const { activeProvider: p, activeModel: m, temperature: t, maxTokens: tk } = event.payload;
      if (p) setActiveProvider(p);
      if (m) {
        setActiveModel(m);
        setThinkingEnabled(false);
      }
      if (t !== undefined) setTemperature(t);
      if (tk !== undefined) setMaxTokens(tk);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Auto scroll
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages, aiState]);

  const resizeAnchored = async (win, width, height) => {
    try {
      const scaleFactor = await win.scaleFactor();
      const currentSize = await win.outerSize();
      const currentPos = await win.outerPosition();
      const logicalSize = currentSize.toLogical(scaleFactor);
      const logicalPos = currentPos.toLogical(scaleFactor);
      const heightDiff = height - logicalSize.height;
      const widthDiff = width - logicalSize.width;
      await win.setSize(new LogicalSize(width, height));
      await win.setPosition(new LogicalPosition(
        logicalPos.x - (widthDiff / 2),
        logicalPos.y - heightDiff
      ));
    } catch (err) {
      console.error("Failed to resize anchored", err);
    }
  };

  // Window resizing based on mode
  useEffect(() => {
    const resizeWindow = async () => {
      try {
        const win = getCurrentWindow();
        await win.setAlwaysOnTop(true);
        if (mode === "widget") {
          await resizeAnchored(win, 200, 200);
        } else {
          await resizeAnchored(win, 360, 420);
        }
      } catch (err) {
        console.error("Failed to resize window", err);
      }
    };
    resizeWindow();
  }, [mode]);

  // Window & Global keypress listener
  const typingTimeoutRef = useRef(null);
  useEffect(() => {
    let unlisten;

    const handleTyping = () => {
      setAiState(prev => {
        if (prev === "waiting_input" || prev === "typing") return "typing";
        return prev;
      });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setAiState(prev => prev === "typing" ? "waiting_input" : prev);
      }, 1200);
    };

    const setupGlobal = async () => {
      unlisten = await listen("global-keypress", handleTyping);
    };
    setupGlobal();

    window.addEventListener("keydown", handleTyping);
    
    return () => {
      window.removeEventListener("keydown", handleTyping);
      if (unlisten) unlisten();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const renderMascots = (draggable) => (
    <>
      <img src={remieWaiting} class={aiState === "waiting_input" ? "active" : ""} {...(draggable ? {'data-tauri-drag-region': true} : {})} />
      <img src={userTyping} class={aiState === "typing" ? "active" : ""} {...(draggable ? {'data-tauri-drag-region': true} : {})} />
      <img src={remieThinking} class={aiState === "thinking" ? "active" : ""} {...(draggable ? {'data-tauri-drag-region': true} : {})} />
      <img src={remieGen} class={aiState === "generating" ? "active" : ""} {...(draggable ? {'data-tauri-drag-region': true} : {})} />
      <img src={remieComplete} class={aiState === "complete" ? "active" : ""} {...(draggable ? {'data-tauri-drag-region': true} : {})} />
    </>
  );

  const handleInput = (e) => {
    setInput(e.target.value);
    if (e.target.value.length > 0) {
      if (aiState === "waiting_input") setAiState("typing");
    } else {
      setAiState("waiting_input");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    // Build message history for context (map ai→assistant for API)
    const history = messages.map((m) => ({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.text,
    }));
    history.push({ role: "user", content: text });

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setAiState("thinking");

    // Add empty AI message bubble for streaming into
    setMessages((prev) => {
      streamingIdxRef.current = prev.length;
      return [...prev, { role: "ai", text: "" }];
    });

    // Set up stream listeners
    const unlistenToken = await listen("chat:token", (event) => {
      setAiState("generating");
      setMessages((prev) => {
        const idx = streamingIdxRef.current;
        if (idx === null) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], text: next[idx].text + event.payload };
        return next;
      });
    });

    const unlistenDone = await listen("chat:done", () => {
      setAiState("complete");
      streamingIdxRef.current = null;
      setTimeout(() => setAiState("waiting_input"), 1500);
      unlistenToken();
      unlistenDone();
      unlistenError();
    });

    // eslint-disable-next-line prefer-const
    let unlistenError;
    unlistenError = await listen("chat:error", (event) => {
      setMessages((prev) => {
        const idx = streamingIdxRef.current;
        if (idx === null) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], text: event.payload, isError: true };
        return next;
      });
      setAiState("waiting_input");
      streamingIdxRef.current = null;
      unlistenToken();
      unlistenDone();
      unlistenError();
    });

    try {
      await invoke("send_message", {
        provider: activeProvider,
        model: activeModel,
        messages: history,
        temperature,
        maxTokens,
        thinkingEnabled,
        reasoningEffort: thinkingEffort,
      });
    } catch (err) {
      // Rust-side error (e.g. no key saved) surfaced here too
      setMessages((prev) => {
        const idx = streamingIdxRef.current;
        if (idx === null) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], text: String(err), isError: true };
        return next;
      });
      setAiState("waiting_input");
      streamingIdxRef.current = null;
      unlistenToken();
      unlistenDone();
      unlistenError();
    }
  };

  const toggleFullscreen = async () => {
    const win = getCurrentWindow();
    const full = !isFullscreen;
    if (full) {
      await resizeAnchored(win, 600, 720);
    } else {
      await resizeAnchored(win, 360, 420);
    }
    setIsFullscreen(full);
  };

  const toIconMode = () => {
    setIsFullscreen(false);
    setMode("widget");
  };

  const getStatusDotClass = () => {
    if (aiState === 'waiting_input') return 'waiting';
    return aiState;
  };

  const openSettings = () => invoke('open_settings_window');

  return (
    <div id="remie-root">
      {mode === "widget" ? (
        <div
          id="icon-mode"
          class={`state-${aiState}`}
          data-tauri-drag-region
          onClick={() => setMode("chatbox")}
          title="Click to open chat"
        >
          <div class="icon-ring" data-tauri-drag-region></div>
          {renderMascots(true)}
          <div class={`status-dot ${getStatusDotClass()}`} data-tauri-drag-region></div>
        </div>
      ) : (
        <div id="chat-mode" class={isFullscreen ? 'full' : ''}>

          {/* Mascot side panel — full mode only */}
          <div class="mascot-side-panel" data-tauri-drag-region onPointerDown={(e) => {
            if (e.button === 0 && !e.target.closest('.settings-bar')) getCurrentWindow().startDragging();
          }}>
            {renderMascots(true)}
            {isFullscreen && (
              <div class="settings-bar" onClick={openSettings}>
                <span class="user-name">{userName}</span>
                <div class="settings-gear" title="Settings">
                  <Settings size={20} />
                </div>
              </div>
            )}
          </div>

          {/* Main chat panel */}
          <div class="chat-content-panel">
            <div
              id="chat-header"
              data-tauri-drag-region
              onPointerDown={(e) => {
                if (e.button === 0 && !e.target.closest('.header-btn')) {
                  getCurrentWindow().startDragging();
                }
              }}
            >
              <div id="chat-avatar">
                {renderMascots(false)}
              </div>
              <div id="chat-title">
                <div class="name">{userName}</div>
                <div class="status-text">
                  <span class="dot" style={{ background: `var(--${getStatusDotClass() === 'waiting' ? 'lav' : getStatusDotClass() === 'typing' ? 'pink-mid' : getStatusDotClass() === 'thinking' ? 'pink-deep' : getStatusDotClass() === 'generating' ? 'lav-deep' : 'complete'})` }}></span>
                  <span id="status-label">{STATE_LABELS[aiState]}</span>
                </div>
              </div>

              {/* 2 buttons: mode toggle + icon mode */}
              <div class="header-btn" title={isFullscreen ? "Mini chat" : "Full chat"} onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </div>
              <div class="header-btn" title="Icon mode" onClick={toIconMode}>
                <Minus size={16} />
              </div>
            </div>

            <div id="chat-body" ref={chatAreaRef}>
              {messages.map((msg, idx) => {
                if (!msg.text && !msg.isError) return null;
                return (
                  <div key={idx} class={`msg ${msg.role}${msg.isError ? ' error' : ''}`}>
                    {msg.isError && <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />}
                    <span>{msg.text}</span>
                  </div>
                );
              })}
              {(aiState === 'thinking' || aiState === 'generating') && (
                <div class="msg ai typing-msg">
                  <span></span><span></span><span></span>
                </div>
              )}
            </div>

            <div id="chat-footer">
              <form class="chat-form" onSubmit={handleSubmit}>
                {/* Thinking popover trigger */}
                {(() => {
                  const supported = THINKING_MODELS.has(activeModel);
                  return (
                    <div style={{ position: 'relative', flexShrink: 0 }} ref={thinkingBtnRef}>
                      <button
                        type="button"
                        class={`icon-btn thinking-toggle${thinkingEnabled && supported ? " active" : ""}${!supported ? " disabled" : ""}`}
                        title="Thinking settings"
                        onClick={() => supported && setThinkingPopoverOpen(v => !v)}
                      >
                        <Settings2 size={16} />
                      </button>
                      {thinkingPopoverOpen && supported && (
                        <div class="thinking-popover">
                          <div class="thinking-popover-row">
                            <span>Thinking</span>
                            <label class="toggle-switch">
                              <input type="checkbox" checked={thinkingEnabled} onChange={e => setThinkingEnabled(e.target.checked)} />
                              <span class="toggle-track" />
                              <span class="toggle-thumb" />
                            </label>
                          </div>
                          {thinkingEnabled && (
                            <>
                              <div class="thinking-popover-row" style={{ fontWeight: 500 }}>Effort</div>
                              <div class="effort-pills">
                                {["low", "medium", "high"].map(e => (
                                  <button key={e} type="button" class={`effort-pill${thinkingEffort === e ? " selected" : ""}`} onClick={() => setThinkingEffort(e)}>{e}</button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      {!supported && thinkingPopoverOpen && (
                        <div class="thinking-popover">
                          <div class="thinking-popover-row"><Info size={14} style={{ marginRight: 6 }} />Not supported</div>
                          <div class="thinking-popover-hint">This model doesn't support reasoning mode. Switch to claude-opus-4-5, claude-sonnet-4-5, or openai/gpt-oss-120b.</div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <input
                  id="chat-input"
                  type="text"
                  placeholder="Type a message..."
                  value={input}
                  onInput={handleInput}
                />
                <button id="send-btn" type="submit">➤</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
