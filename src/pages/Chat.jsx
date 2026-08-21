import { useState, useEffect, useRef } from "preact/hooks";
import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { getApiKey } from "../stronghold";
import { streamLLM } from "../api/llmClient";
import { Maximize2, Minimize2, Minus, AlertTriangle, Settings2, Info, PanelLeft, X, Copy, Pencil, Loader2, RefreshCw } from "lucide-preact";
import Sidebar from "../components/Sidebar.jsx";
import { marked } from "marked";
import DOMPurify from "dompurify";
import markedKatex from "marked-katex-extension";
import "katex/dist/katex.min.css";

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseMessageChunks(text) {
  const chunks = [];
  const regex = /<think>([\s\S]*?)(<\/think>|$)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      chunks.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }
    const isClosed = match[2] === '</think>';
    chunks.push({ type: 'think', content: match[1], isClosed });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    chunks.push({ type: 'text', content: text.substring(lastIndex) });
  }
  // Filter out empty text chunks
  return chunks.filter(c => c.type === 'think' || c.content.trim() !== '');
}

function preprocessMarkdown(text) {
  let processed = text;
  
  const codeMatches = processed.match(/```/g) || [];
  const isCodeOpen = codeMatches.length % 2 !== 0;
  if (isCodeOpen) {
    return processed + '\n```';
  }

  const mathMatches = processed.match(/\$\$/g) || [];
  let isMathOpen = mathMatches.length % 2 !== 0;

  const lastBracketOpen = processed.lastIndexOf('\\[');
  const lastBracketClose = processed.lastIndexOf('\\]');
  let isBracketOpen = lastBracketOpen > lastBracketClose;

  const lastParenOpen = processed.lastIndexOf('\\(');
  const lastParenClose = processed.lastIndexOf('\\)');
  let isParenOpen = lastParenOpen > lastParenClose;

  if (isMathOpen) {
    processed += '$$';
  } else if (isBracketOpen) {
    processed += '\\]';
  } else if (isParenOpen) {
    processed += '\\)';
  }

  // Ensure $$ blocks are on their own lines for marked-katex to parse them properly as blocks
  processed = processed.replace(/(?<!\$)\$\$(?!\$)/g, '\n$$$$\n');
  processed = processed.replace(/\n{3,}/g, '\n\n');

  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, "$$$$$1$$$$");
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, "$$$1$$");

  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, inner) => {
    let open = 0;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '\\') { i++; continue; }
      if (inner[i] === '{') open++;
      if (inner[i] === '}') open = Math.max(0, open - 1);
    }
    return '$$' + inner + '}'.repeat(open) + '$$';
  });

  processed = processed.replace(/(?<!\$)\$(?!\$)([\s\S]*?)(?<!\$)\$(?!\$)/g, (match, inner) => {
    let open = 0;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '\\') { i++; continue; }
      if (inner[i] === '{') open++;
      if (inner[i] === '}') open = Math.max(0, open - 1);
    }
    return '$' + inner + '}'.repeat(open) + '$';
  });

  return processed;
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

marked.use(markedKatex({ throwOnError: false, displayMode: true }));

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

const CopyMessageButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };
  return (
    <button type="button" class="action-btn" title="Copy text" onClick={handleCopy}>
      {copied ? <span style={{ fontSize: '11px', color: '#8fd6a8', fontWeight: 'bold' }}>Copied!</span> : <Copy size={13} />}
    </button>
  );
};

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
  const [showSidebar, setShowSidebar] = useState(false);
  const [temperature, setTemperature] = useState(1.0);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [thinkingEffort, setThinkingEffort] = useState("medium");
  const [showTokenCount, setShowTokenCount] = useState(false);
  const [mascotModeAction, setMascotModeAction] = useState("mascot");
  const [thinkingPopoverOpen, setThinkingPopoverOpen] = useState(false);
  const thinkingBtnRef = useRef(null);
  const thinkingTimeoutRef = useRef(null);
  const chatAreaRef = useRef(null);
  const streamingIdxRef = useRef(null); // index of the message being streamed
  
  const [editingMsgIdx, setEditingMsgIdx] = useState(null);
  const [editInput, setEditInput] = useState("");

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
          const s = await load("config.json", { autoSave: false });
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
      const { activeProvider: p, activeModel: m, temperature: t, maxTokens: tk, showTokenCount: st, mascotModeAction: ma } = event.payload;
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
      if (ma !== undefined) setMascotModeAction(ma);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Auto scroll
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages, isFullscreen]);

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

  const isInitialMount = useRef(true);

  // Sync skipTaskbar with mascot mode setting
  useEffect(() => {
    if (isMobile) return;
    try {
      getCurrentWindow().setSkipTaskbar(mascotModeAction !== "taskbar");
    } catch (err) {
      console.error("Failed to set skipTaskbar", err);
    }
  }, [mascotModeAction, isMobile]);

  // Window resizing based on mode
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const resizeWindow = async () => {
      if (isMobile) return;
      try {
        const win = getCurrentWindow();
        await win.setAlwaysOnTop(true);
        if (mode === "widget") {
          const size = await win.outerSize();
          const scale = await win.scaleFactor();
          const logical = size.toLogical(scale);
          localStorage.setItem("remie_chatbox_width", logical.width);
          localStorage.setItem("remie_chatbox_height", logical.height);

          try { await win.setMinSize(null); } catch(e){}
          try { await win.setResizable(false); } catch(e){}
          await resizeAnchored(win, 200, 200);
        } else {
          let w = parseInt(localStorage.getItem("remie_chatbox_width")) || 360;
          let h = parseInt(localStorage.getItem("remie_chatbox_height")) || 420;
          w = Math.max(w, 280);
          h = Math.max(h, 360);
          try { await win.setMinSize(new LogicalSize(280, 360)); } catch(e){}
          await resizeAnchored(win, w, h);
          try { await win.setResizable(true); } catch(e){}
        }
      } catch (err) {
        console.error("Failed to resize window", err);
      }
    };
    resizeWindow();
  }, [mode, isMobile]);

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

  const renderMascots = (draggable) => {
    const state = getDerivedAiState();
    return (
      <>
        <img src={remieWaiting} class={state === "waiting_input" ? "active" : ""} {...(draggable ? {'data-tauri-drag-region': true} : {})} />
        <img src={userTyping} class={state === "typing" ? "active" : ""} {...(draggable ? {'data-tauri-drag-region': true} : {})} />
        <img src={remieThinking} class={state === "thinking" ? "active" : ""} {...(draggable ? {'data-tauri-drag-region': true} : {})} />
        <img src={remieGen} class={state === "generating" ? "active" : ""} {...(draggable ? {'data-tauri-drag-region': true} : {})} />
        <img src={remieComplete} class={state === "complete" ? "active" : ""} {...(draggable ? {'data-tauri-drag-region': true} : {})} />
      </>
    );
  };

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

  const submitMessage = async (text, currentHistory) => {
    if (streamingIdxRef.current !== null) return;
    
    // Build message history for context (map ai→assistant for API)
    const history = currentHistory.map((m) => ({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.text,
    }));
    history.push({ role: "user", content: text });

    const newMessages = [...currentHistory, { role: "user", text }];
    setMessages(newMessages);
    setAiState("thinking");

    // Calculate index for the new AI message and set ref synchronously
    const aiMsgIdx = newMessages.length;
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
        let unlisten;
        unlisten = await listen(eventId, (e) => {
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
            if (unlisten) unlisten();
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
            if (unlisten) unlisten();
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

    setInput("");
    await submitMessage(text, messages);
  };

  const startEdit = (idx, text) => {
    setEditingMsgIdx(idx);
    setEditInput(text);
  };

  const handleEditSubmit = (idx) => {
    if (!editInput.trim()) return;
    const newText = editInput.trim();
    setEditingMsgIdx(null);
    const newHistory = messages.slice(0, idx);
    submitMessage(newText, newHistory);
  };

  const handleRetry = (aiIdx) => {
    if (aiIdx === 0 || streamingIdxRef.current !== null) return;
    const userMsg = messages[aiIdx - 1];
    if (!userMsg || userMsg.role !== 'user') return;
    
    const newHistory = messages.slice(0, aiIdx - 1);
    submitMessage(userMsg.text, newHistory);
  };

  const toggleFullscreen = async () => {
    const win = getCurrentWindow();
    const full = !isFullscreen;
    if (full) {
      await win.maximize();
    } else {
      try { await win.unmaximize(); } catch (e) {}
    }
    setIsFullscreen(full);
  };

  const toIconMode = async () => {
    if (mascotModeAction === "taskbar") {
      try {
        await getCurrentWindow().minimize();
      } catch (e) {
        console.error(e);
      }
    } else {
      setIsFullscreen(false);
      setMode("widget");
    }
  };

  const closeApp = async () => {
    try {
      await invoke("exit_app");
    } catch (e) {
      console.error(e);
    }
  };

  const getDerivedAiState = () => {
    if (aiState !== "generating") return aiState;
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "ai" && lastMsg.text) {
        const chunks = parseMessageChunks(lastMsg.text);
        if (chunks.length > 0) {
          const lastChunk = chunks[chunks.length - 1];
          if (lastChunk.type === "think" && !lastChunk.isClosed) {
            return "thinking";
          }
        }
      }
    }
    return "generating";
  };

  const getStatusDotClass = () => {
    const state = getDerivedAiState();
    if (state === 'waiting_input') return 'waiting';
    return state;
  };

  const openSettings = () => {
    setShowSidebar(false);
    window.location.hash = "settings";
  };

  const isOverlaySidebar = isMobile || !isFullscreen;
  const chatModeClass = [
    isFullscreen ? 'full' : '',
    isOverlaySidebar ? 'with-overlay-sidebar' : '',
    showSidebar ? 'sidebar-open' : ''
  ].filter(Boolean).join(' ');

  return (
    <div id="remie-root">
      {mode === "widget" ? (
        <div
          id="icon-mode"
          class={`state-${aiState}`}
          data-tauri-drag-region
          onDblClick={() => setMode("chatbox")}
          title="Double click to open chat"
        >
          <div class="icon-ring" data-tauri-drag-region></div>
          {renderMascots(true)}
          <div class={`status-dot ${getStatusDotClass()}`} data-tauri-drag-region></div>
        </div>
      ) : (
        <div id="chat-mode" class={chatModeClass}>

          {/* Backdrop for closing overlay sidebar */}
          {isOverlaySidebar && showSidebar && (
            <div class="sidebar-backdrop" onClick={() => setShowSidebar(false)}></div>
          )}

          {/* Mascot side panel */}
          <Sidebar 
            isFullscreen={isFullscreen}
            isMobile={isMobile}
            userName={userName}
            renderMascots={renderMascots}
            openSettings={openSettings}
            closeSidebar={() => setShowSidebar(false)}
            isOverlaySidebar={isOverlaySidebar}
          />

          {/* Main chat panel */}
          <div class="chat-content-panel">
            <div
              id="chat-header"
              onMouseDown={(e) => {
                if (e.button === 0 && !e.target.closest('.header-btn')) {
                  // Only drag if it's a single click
                  if (e.detail > 1) return;
                  getCurrentWindow().startDragging().catch(err => console.error("Drag error:", err));
                }
              }}
            >
              {/* Sidebar Button */}
              {isOverlaySidebar && (
                <div class="header-btn" title="Show side panel" onClick={() => setShowSidebar(true)}>
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

              {/* Icon mode button - Desktop only (Minimize) */}
              {!isMobile && (
                <div class="header-btn" title="Icon mode" onClick={toIconMode}>
                  <Minus size={16} />
                </div>
              )}

              {/* Desktop Expand Button (Maximize) */}
              {!isMobile && (
                <div class="header-btn" title={isFullscreen ? "Restore" : "Maximize"} onClick={toggleFullscreen}>
                  {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </div>
              )}

              {/* Close app button */}
              {!isMobile && (
                <div class="header-btn close-btn" title="Close" onClick={closeApp}>
                  <X size={16} />
                </div>
              )}
            </div>

            <div id="chat-body" ref={chatAreaRef}>
              {messages.map((msg, idx) => {
                if (!msg.text && !msg.isError) return null;
                const chunks = parseMessageChunks(msg.text || "");
                
                const responseText = chunks.filter(c => c.type === 'text').map(c => c.content).join('').trim();
                return (
                  <div key={idx} class="msg-wrapper">
                    {editingMsgIdx === idx ? (
                      <div class="edit-mode-container">
                        <textarea
                          class="edit-msg-input"
                          value={editInput}
                          onInput={(e) => setEditInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleEditSubmit(idx);
                            }
                          }}
                        />
                        <div class="edit-actions">
                          <button type="button" class="edit-btn cancel" onClick={() => setEditingMsgIdx(null)}>Cancel</button>
                          <button type="button" class="edit-btn submit" onClick={() => handleEditSubmit(idx)}>Submit</button>
                        </div>
                      </div>
                    ) : (
                      <>
                          {chunks.map((chunk, cIdx) => {
                            if (chunk.type === 'think') {
                              const isLastMsg = idx === messages.length - 1;
                              const isGenerating = aiState === "generating" || aiState === "thinking";
                              const showAsStreaming = !chunk.isClosed && isLastMsg && isGenerating;
                              
                              if (showAsStreaming) {
                                const lines = chunk.content.trim().split('\n').filter(l => l.trim());
                                const lastLine = lines[lines.length - 1] || 'Thinking...';
                                return (
                                  <div key={cIdx} class="think-loading-indicator">
                                    <Loader2 size={14} class="spin-icon" />
                                    <span class="think-line" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{lastLine}</span>
                                  </div>
                                );
                              } else {
                                const html = DOMPurify.sanitize(marked.parse(preprocessMarkdown(chunk.content)), {
                                  ADD_TAGS: ['math', 'annotation', 'semantics', 'mrow', 'mi', 'mn', 'mo', 'ms', 'mspace', 'mtext', 'menclose', 'merror', 'mfenced', 'mfrac', 'mpadded', 'mphantom', 'mroot', 'msqrt', 'mstyle', 'mmultiscripts', 'mover', 'mprescripts', 'msub', 'msubsup', 'msup', 'munder', 'munderover', 'none', 'annotation-xml'],
                                  ADD_ATTR: ['target', 'class', 'style']
                                });
                                return (
                                  <details key={cIdx} class="think-block completed outside-bubble">
                                    <summary><span class="think-icon"></span>Thought</summary>
                                    <div class="think-content markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
                                  </details>
                                );
                              }
                            } else {
                              const textToParse = preprocessMarkdown(chunk.content);
                              const html = DOMPurify.sanitize(marked.parse(textToParse), {
                                ADD_TAGS: ['math', 'annotation', 'semantics', 'mrow', 'mi', 'mn', 'mo', 'ms', 'mspace', 'mtext', 'menclose', 'merror', 'mfenced', 'mfrac', 'mpadded', 'mphantom', 'mroot', 'msqrt', 'mstyle', 'mmultiscripts', 'mover', 'mprescripts', 'msub', 'msubsup', 'msup', 'munder', 'munderover', 'none', 'annotation-xml'],
                                ADD_ATTR: ['target', 'class', 'style']
                              });
                              return (
                                <div key={cIdx} class={`msg ${msg.role}${msg.isError ? ' error' : ''}`}>
                                  {msg.isError && cIdx === 0 && <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />}
                                  <div class="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
                                </div>
                              );
                            }
                          })}
                        <div class={`msg-actions ${msg.role}`}>
                          {msg.role === "ai" && showTokenCount && msg.tokens > 0 ? (
                            <div class="token-count">Tokens used: {msg.tokens}</div>
                          ) : <div />}
                          <div class="action-icons">
                            {msg.role === "user" && (
                              <button type="button" class="action-btn" title="Edit message" onClick={() => startEdit(idx, msg.text)}>
                                <Pencil size={13} />
                              </button>
                            )}
                            {msg.role === "ai" && idx > 0 && responseText.length > 0 && (
                              <button type="button" class="action-btn" title="Retry" onClick={() => handleRetry(idx)} disabled={streamingIdxRef.current !== null}>
                                <RefreshCw size={13} />
                              </button>
                            )}
                            {msg.role === "ai" && idx > 0 && responseText.length > 0 && <CopyMessageButton text={responseText} />}
                          </div>
                        </div>
                      </>
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
