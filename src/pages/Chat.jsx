import { useState, useEffect, useRef } from "preact/hooks";
import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { getApiKey } from "../stronghold";
import { streamLLM } from "../llmClient";
import { Maximize2, Minimize2, Minus, AlertTriangle, Settings2, Info, PanelLeft } from "lucide-preact";
import Sidebar from "../components/Sidebar.jsx";
import { marked } from "marked";
import DOMPurify from "dompurify";

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

marked.use({
  renderer: {
    code(token) {
      const code = token.text;
      const lang = token.lang || '';
      return `<div class="code-block-container">
        <pre><code class="language-${lang}">${token.escaped ? token.text : escapeHtml(token.text)}</code></pre>
        <button class="copy-btn" data-code="${encodeURIComponent(code)}" type="button">Copy</button>
      </div>`;
    }
  }
});

// Assets
import remieGen from "../assets/remie_gen.gif";
import remieComplete from "../assets/remie_complete.gif";
import remieThinking from "../assets/remie_thinking.gif";
import remieWaiting from "../assets/remie_waiting_input.gif";
import userTyping from "../assets/user_typing.gif";

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
  "openai/gpt-oss-120b", "openai/gpt-oss-20b", "openai/gpt-oss-safeguard-20b",
  // Claude extended thinking
  "claude-opus-4-5", "claude-sonnet-4-5",
]);

export default function ChatApp() {
  const [isMobile] = useState(() => (window.__TAURI_INTERNALS__ && ["android", "ios"].includes(window.__TAURI_INTERNALS__.platform)) || navigator.userAgent.includes("Android") || navigator.userAgent.includes("iPhone") || navigator.userAgent.includes("iPad"));
  const [mode, setMode] = useState("chatbox"); // 'chatbox' or 'widget'
  const [aiState, setAiState] = useState("waiting_input");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [userName, setUserName] = useState("Manager");
  const [birthday, setBirthday] = useState({ day: "", month: "", year: "" });
  const [activeProvider, setActiveProvider] = useState("openai");
  const [activeModel, setActiveModel] = useState("gpt-4o");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [temperature, setTemperature] = useState(1.0);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [thinkingEffort, setThinkingEffort] = useState("medium");
  const [showTokenCount, setShowTokenCount] = useState(false);
  const [thinkingPopoverOpen, setThinkingPopoverOpen] = useState(false);
  const thinkingBtnRef = useRef(null);
  const thinkingTimeoutRef = useRef(null);
  const chatAreaRef = useRef(null);
  const streamingIdxRef = useRef(null); // index of the message being streamed

  // Load config from plugin-store on mount
  useEffect(() => {
    const isBirthday = (bday) => {
      if (!bday || !bday.month || !bday.day) return false;
      const today = new Date();
      return parseInt(bday.month) === today.getMonth() + 1 &&
             parseInt(bday.day) === today.getDate();
    };

    const initStore = async () => {
      try {
        let name = "Manager", bday = { day: "", month: "", year: "" }, provider = "openai", model = "gpt-4o", temp = 1.0, tokens = 2048, showTokens = false;

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
        } else {
          const s = await load("config.json", { autoSave: false });
          name = await s.get("userName") ?? name;
          bday = await s.get("birthday") ?? bday;
          provider = await s.get("activeProvider") ?? provider;
          model = await s.get("activeModel") ?? model;
          temp = await s.get("temperature") ?? temp;
          tokens = await s.get("maxTokens") ?? tokens;
          showTokens = await s.get("showTokenCount") ?? showTokens;
        }

        setUserName(name);
        setBirthday(bday);
        setActiveProvider(provider);
        setActiveModel(model);
        setTemperature(temp);
        setMaxTokens(tokens);
        setShowTokenCount(showTokens);

        const greeting = isBirthday(bday)
          ? `Happy Birthday, ${name}! It's Remie~ Wishing you a wonderful day today!`
          : `Hi ${name}, It's Remie~`;
        setMessages([{ role: "ai", text: greeting }]);
      } catch (err) {
        console.error("Failed to load store:", err);
        setMessages([{ role: "ai", text: `Hi Manager, It's Remie~` }]);
      }
    };
    initStore();
  }, []);

  // Live update when Settings saves profile changes
  useEffect(() => {
    let unlisten;
    listen("profile:updated", (event) => {
      const { userName: newName, birthday: newBday } = event.payload;
      if (newName) setUserName(newName);
      if (newBday) setBirthday(newBday);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Live update when Settings changes provider, model, or gen params
  useEffect(() => {
    let unlisten;
    listen("config:updated", (event) => {
      const { activeProvider: p, activeModel: m, temperature: t, maxTokens: tk, showTokenCount: st } = event.payload;
      if (p) setActiveProvider(p);
      if (m) {
        setActiveModel(m);
        setThinkingEnabled(prev => {
          if (prev && !THINKING_MODELS.has(m)) {
            setTimeout(() => {
              setThinkingPopoverOpen(true);
              setTimeout(() => setThinkingPopoverOpen(false), 3500);
            }, 100);
            return false;
          }
          return prev;
        });
      }
      if (t !== undefined) setTemperature(t);
      if (tk !== undefined) setMaxTokens(tk);
      if (st !== undefined) setShowTokenCount(st);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Auto scroll
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Event delegation for copy buttons
  useEffect(() => {
    const handleCopy = async (e) => {
      const btn = e.target.closest(".copy-btn");
      if (!btn) return;
      const code = decodeURIComponent(btn.getAttribute("data-code") || "");
      try {
        await navigator.clipboard.writeText(code);
        btn.innerText = "Copied!";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.innerText = "copy";
          btn.classList.remove("copied");
        }, 2000);
      } catch (err) {
        console.error("Failed to copy text: ", err);
      }
    };

    const chatBody = chatAreaRef.current;
    if (chatBody) {
      chatBody.addEventListener("click", handleCopy);
    }

    // Click outside listener for thinking popover
    const handleClickOutside = (e) => {
      if (thinkingBtnRef.current && !thinkingBtnRef.current.contains(e.target)) {
        setThinkingPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      if (chatBody) {
        chatBody.removeEventListener("click", handleCopy);
      }
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  const resizeAnchored = async (win, width, height) => {
    if (navigator.userAgent.includes("Android") || navigator.userAgent.includes("iPhone") || navigator.userAgent.includes("iPad")) return;
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
      if (isMobile) return;
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
    
    // Auto-adjust height up to ~3 lines (accounting for border height)
    const textarea = e.target;
    textarea.style.height = "auto";
    const newHeight = Math.min(textarea.scrollHeight + 4, 76);
    textarea.style.height = `${newHeight}px`;

    if (e.target.value.length > 0) {
      if (aiState === "waiting_input") setAiState("typing");
    } else {
      setAiState("waiting_input");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (streamingIdxRef.current !== null) return;
    
    const text = input.trim();
    if (!text) return;

    // Reset textarea height
    const textarea = document.getElementById("chat-input");
    if (textarea) {
      textarea.style.height = "38px";
    }

    // Build message history for context (map ai→assistant for API)
    const history = messages.map((m) => ({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.text,
    }));
    history.push({ role: "user", content: text });

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setAiState("thinking");

    // Calculate index for the new AI message and set ref synchronously
    const aiMsgIdx = messages.length + 1;
    streamingIdxRef.current = aiMsgIdx;

    // Add empty AI message bubble for streaming into
    setMessages((prev) => [...prev, { role: "ai", text: "" }]);

    try {
      const formattedBday = (birthday.day && birthday.month)
        ? `${birthday.day}/${birthday.month}${birthday.year ? `/${birthday.year}` : ''}`
        : "Unknown";

      const apiKey = await getApiKey(activeProvider);
      if (!apiKey) {
        throw new Error(`API key for ${activeProvider} is not set. Please add it in Settings.`);
      }

      if (isMobile) {
        const totalTokens = await streamLLM({
          provider: activeProvider,
          apiKey,
          model: activeModel,
          messages: history,
          temperature,
          maxTokens,
          thinkingEnabled,
          reasoningEffort: thinkingEffort,
          userName,
          userBday: formattedBday,
          localTime: new Date().toLocaleString(),
          onToken: (token) => {
            setAiState("generating");
            setMessages((prev) => {
              const idx = streamingIdxRef.current;
              if (idx === null) return prev;
              const next = [...prev];
              next[idx] = { ...next[idx], text: next[idx].text + token };
              return next;
            });
          }
        });

        setMessages((prev) => {
          const idx = streamingIdxRef.current;
          if (idx === null) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], tokens: totalTokens };
          return next;
        });

        setAiState("complete");
        streamingIdxRef.current = null;
        setTimeout(() => setAiState("waiting_input"), 1500);

      } else {
        // Desktop uses Rust streaming backend to utilize Stronghold vault and proxy
        const eventId = `chat-stream-${Date.now()}`;
        const unlisten = await listen(eventId, (e) => {
          const rawMessage = e.payload;
          let message = rawMessage;
          if (typeof rawMessage === "string") {
            try { message = JSON.parse(rawMessage); } catch(err) {}
          }
          
          if (message.event === "Token") {
            setAiState("generating");
            setMessages((prev) => {
              const idx = streamingIdxRef.current;
              if (idx === null) return prev;
              const next = [...prev];
              next[idx] = { ...next[idx], text: next[idx].text + message.data };
              return next;
            });
          } else if (message.event === "Done") {
            const tokenCount = message.data;
            setMessages((prev) => {
              const idx = streamingIdxRef.current;
              if (idx === null) return prev;
              const next = [...prev];
              next[idx] = { ...next[idx], tokens: tokenCount };
              return next;
            });
            setAiState("complete");
            streamingIdxRef.current = null;
            unlisten();
            setTimeout(() => setAiState("waiting_input"), 1500);
          } else if (message.event === "Error") {
            console.error("[Chat] Error:", message.data);
            setMessages((prev) => {
              const idx = streamingIdxRef.current;
              if (idx === null) return prev;
              const next = [...prev];
              next[idx] = { ...next[idx], text: message.data, isError: true };
              return next;
            });
            setAiState("waiting_input");
            streamingIdxRef.current = null;
            unlisten();
          }
        });

        await invoke("send_message", {
          provider: activeProvider,
          apiKey: apiKey,
          model: activeModel,
          messages: history,
          temperature,
          maxTokens,
          thinkingEnabled,
          reasoningEffort: thinkingEffort,
          userName,
          userBday: formattedBday,
          localTime: new Date().toLocaleString(),
          eventId: eventId,
        });
      }

    } catch (err) {
      // Rust-side error (e.g. no key saved) surfaced here too
      console.error("[Chat] Sync error:", err);
      setMessages((prev) => {
        const idx = streamingIdxRef.current;
        if (idx === null) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], text: String(err), isError: true };
        return next;
      });
      setAiState("waiting_input");
      streamingIdxRef.current = null;
    }
  };

  const toggleFullscreen = async () => {
    const win = getCurrentWindow();
    const full = !isFullscreen;
    if (full) {
      await resizeAnchored(win, 800, 720);
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

  const openSettings = async () => {
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent) || (window.__TAURI_INTERNALS__ && ["android", "ios"].includes(window.__TAURI_INTERNALS__.platform));
    if (isMobileDevice) {
      window.location.hash = "settings";
    } else {
      try {
        await invoke('open_settings_window');
      } catch (e) {
        window.location.hash = "settings";
      }
    }
  };

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

          {/* Mobile backdrop for closing sidebar */}
          {isFullscreen && isMobile && (
            <div class="sidebar-backdrop" onClick={() => setIsFullscreen(false)}></div>
          )}

          {/* Mascot side panel */}
          <Sidebar 
            isFullscreen={isFullscreen}
            isMobile={isMobile}
            userName={userName}
            renderMascots={renderMascots}
            openSettings={openSettings}
            closeSidebar={() => setIsFullscreen(false)}
          />

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
              {/* Mobile Sidebar Button (Back button style) */}
              {isMobile && (
                <div class="header-btn" title="Show side panel" onClick={toggleFullscreen}>
                  <PanelLeft size={18} />
                </div>
              )}

              <div id="chat-avatar">
                {renderMascots(false)}
              </div>
              <div id="chat-title">
                <div class="name">Remie</div>
                <div class="status-text">
                  <span class="dot" style={{ background: `var(--${getStatusDotClass() === 'waiting' ? 'lav' : getStatusDotClass() === 'typing' ? 'pink-mid' : getStatusDotClass() === 'thinking' ? 'pink-deep' : getStatusDotClass() === 'generating' ? 'lav-deep' : 'complete'})` }}></span>
                  <span id="status-label">{STATE_LABELS[aiState]}</span>
                </div>
              </div>

              {/* Desktop Expand Button */}
              {!isMobile && (
                <div class="header-btn" title={isFullscreen ? "Collapse" : "Expand"} onClick={toggleFullscreen}>
                  {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </div>
              )}

              {/* Icon mode button - Desktop only */}
              {!isMobile && (
                <div class="header-btn" title="Icon mode" onClick={toIconMode}>
                  <Minus size={16} />
                </div>
              )}
            </div>

            <div id="chat-body" ref={chatAreaRef}>
              {messages.map((msg, idx) => {
                if (!msg.text && !msg.isError) return null;
                const html = DOMPurify.sanitize(marked.parse(msg.text || ""));
                return (
                  <div key={idx} class="msg-wrapper">
                    <div class={`msg ${msg.role}${msg.isError ? ' error' : ''}`}>
                      {msg.isError && <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />}
                      <div class="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
                    </div>
                    {msg.role === "ai" && showTokenCount && msg.tokens > 0 && (
                      <div class="token-count">Tokens used: {msg.tokens}</div>
                    )}
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
                        title={supported ? "Thinking settings (supported by this model)" : "Thinking mode not supported by this model"}
                        onClick={() => {
                          if (supported || isMobile) {
                            setThinkingPopoverOpen(v => {
                              const next = !v;
                              if (next && isMobile && !supported) {
                                if (thinkingTimeoutRef.current) clearTimeout(thinkingTimeoutRef.current);
                                thinkingTimeoutRef.current = setTimeout(() => {
                                  setThinkingPopoverOpen(false);
                                }, 3500);
                              }
                              return next;
                            });
                          }
                        }}
                        onMouseEnter={() => {
                          if (!supported && !isMobile) setThinkingPopoverOpen(true);
                        }}
                        onMouseLeave={() => {
                          if (!supported && !isMobile) setThinkingPopoverOpen(false);
                        }}
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
                <textarea
                  id="chat-input"
                  placeholder="Type a message..."
                  value={input}
                  onInput={handleInput}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  maxLength={2000}
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
