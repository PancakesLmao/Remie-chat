import { useState, useEffect, useRef } from "preact/hooks";
import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Settings, Maximize2, Minimize2, Minus } from "lucide-preact";

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

export default function ChatApp() {
  const [mode, setMode] = useState("chatbox"); // 'chatbox' or 'widget'
  const [aiState, setAiState] = useState("waiting_input");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "ai", text: "hi Manager, It's Remie~" }
  ]);
  const [userName] = useState("Manager");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const chatAreaRef = useRef(null);

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
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: "user", text: input }]);
    setInput("");
    setAiState("thinking");
    setTimeout(() => {
      setAiState("generating");
      setTimeout(() => {
        setMessages(prev => [...prev, { role: "ai", text: "here's a placeholder reply — wire this up to your model!" }]);
        setAiState("complete");
        setTimeout(() => setAiState("waiting_input"), 1500);
      }, 2000);
    }, 900);
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
              {messages.map((msg, idx) => (
                <div key={idx} class={`msg ${msg.role}`}>{msg.text}</div>
              ))}
              {(aiState === 'thinking' || aiState === 'generating') && (
                <div class="msg ai typing-msg">
                  <span></span><span></span><span></span>
                </div>
              )}
            </div>

            <div id="chat-footer">
              <form class="chat-form" onSubmit={handleSubmit}>
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
