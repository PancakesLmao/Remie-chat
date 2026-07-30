import { useState, useEffect, useRef } from "preact/hooks";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

// Assets
import remieGen from "./assets/remie_gen.gif";
import remieComplete from "./assets/remie_complete.gif";
import remieThinking from "./assets/remie_thinking.gif";
import remieWaiting from "./assets/remie_waiting_input.gif";
import userTyping from "./assets/user_typing.gif"; // assuming it exists

const STATE_LABELS = {
  waiting_input: 'waiting for you',
  typing: 'listening...',
  thinking: 'thinking...',
  generating: 'writing reply...',
  complete: 'done!'
};

function App() {
  const [mode, setMode] = useState("chatbox"); // 'chatbox' or 'widget'
  const [aiState, setAiState] = useState("waiting_input"); // 'waiting_input', 'typing', 'thinking', 'generating', 'complete'
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "ai", text: "hi Manager, It's Remie~" }
  ]);
  const chatAreaRef = useRef(null);

  // Auto scroll
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages, aiState]);

  // Window resizing based on mode
  useEffect(() => {
    const resizeWindow = async () => {
      try {
        const win = getCurrentWindow();
        await win.setAlwaysOnTop(true);
        if (mode === "widget") {
          await win.setFullscreen(false);
          await win.setSize(new LogicalSize(200, 200)); // 25% bigger to fit the 130px icon + ring + shadow
        } else {
          await win.setSize(new LogicalSize(320, 420));
        }
      } catch (err) {
        console.error("Failed to resize window", err);
      }
    };
    resizeWindow();
  }, [mode]);

  // Global keypress listener
  const typingTimeoutRef = useRef(null);
  useEffect(() => {
    let unlisten;
    
    const setupListener = async () => {
      unlisten = await listen("global-keypress", () => {
        setAiState(prev => {
          if (prev === "waiting_input" || prev === "typing") {
            return "typing";
          }
          return prev; // don't interrupt generating/thinking
        });
        
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          setAiState(prev => prev === "typing" ? "waiting_input" : prev);
        }, 1200);
      });
    };
    
    setupListener();
    return () => {
      if (unlisten) unlisten();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const getIcon = () => {
    switch (aiState) {
      case "typing": return userTyping;
      case "thinking": return remieThinking;
      case "generating": return remieGen;
      case "complete": return remieComplete;
      case "waiting_input":
      default: return remieWaiting;
    }
  };

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
        setMessages(prev => [
          ...prev, 
          { role: "ai", text: "here's a placeholder reply — wire this up to your model!" }
        ]);
        setAiState("complete");
        
        setTimeout(() => {
          setAiState("waiting_input");
        }, 1500);
      }, 2000);
    }, 900);
  };

  const toggleFullscreen = async () => {
    const win = getCurrentWindow();
    const full = !isFullscreen;
    if (full) {
      await win.setSize(new LogicalSize(560, 720));
    } else {
      await win.setSize(new LogicalSize(320, 420));
    }
    setIsFullscreen(full);
  };

  // The status dot class relies on aiState matching 'waiting', 'typing', etc.
  const getStatusDotClass = () => {
    if (aiState === 'waiting_input') return 'waiting';
    return aiState;
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
          <img src={getIcon()} class="active" data-tauri-drag-region />
          <div class={`status-dot ${getStatusDotClass()}`} data-tauri-drag-region></div>
        </div>
      ) : (
        <div id="chat-mode" class={isFullscreen ? 'full' : ''}>
          
          <div class="mascot-side-panel" data-tauri-drag-region onPointerDown={(e) => {
            if (e.button === 0) getCurrentWindow().startDragging();
          }}>
            <img src={getIcon()} class="active" data-tauri-drag-region />
          </div>

          <div class="chat-content-panel">
            <div 
              id="chat-header" 
              data-tauri-drag-region
              onPointerDown={(e) => {
                // only start drag if we didn't click a button
                if (e.button === 0 && !e.target.closest('.header-btn')) {
                  getCurrentWindow().startDragging();
                }
              }}
            >
              <div id="chat-avatar">
                <img src={getIcon()} class="active" />
              </div>
              <div id="chat-title">
                <div class="name">Remie</div>
                <div class="status-text">
                  <span class="dot" style={{ background: `var(--${getStatusDotClass() === 'waiting' ? 'lav' : getStatusDotClass() === 'typing' ? 'pink-mid' : getStatusDotClass() === 'thinking' ? 'pink-deep' : getStatusDotClass() === 'generating' ? 'lav-deep' : 'complete'})` }}></span>
                  <span id="status-label">{STATE_LABELS[aiState]}</span>
                </div>
              </div>
              <div class="header-btn" title="Toggle fullscreen" onClick={toggleFullscreen}>⤢</div>
              <div class="header-btn" title="Minimize to icon" onClick={() => { setIsFullscreen(false); setMode("widget"); }}>—</div>
            </div>
            
            <div id="chat-body" ref={chatAreaRef}>
              {messages.map((msg, idx) => (
                <div key={idx} class={`msg ${msg.role}`}>
                  {msg.text}
                </div>
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

export default App;
