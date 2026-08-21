import { useState, useEffect } from 'preact/hooks';
import "./App.css";
import SettingsPage from "./pages/Settings.jsx";
import ChatApp from "./pages/Chat.jsx";
import Loading from "./components/Loading.jsx";
import { fetchAndCacheModels } from "./api/models.js";
import { load as storeLoad } from '@tauri-apps/plugin-store';
import { listen } from '@tauri-apps/api/event';

// Detect which page this window should render on desktop
const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent) || (window.__TAURI_INTERNALS__ && ["android", "ios"].includes(window.__TAURI_INTERNALS__.platform));

function App() {
  const [page, setPage] = useState(window.location.hash === '#settings' ? 'settings' : 'chat');
  const [appReady, setAppReady] = useState(false);
  const [loadingText, setLoadingText] = useState("Loading...");

  useEffect(() => {
    if (navigator.userAgent.includes("Android") || navigator.userAgent.includes("iPhone") || navigator.userAgent.includes("iPad")) {
      document.body.classList.add("mobile-device");
    }
    const handleHashChange = () => {
      setPage(window.location.hash === '#settings' ? 'settings' : 'chat');
    };
    window.addEventListener('hashchange', handleHashChange);
    
    // Listen for tray menu settings click
    let unlisten;
    listen('open-settings', () => {
      window.location.hash = 'settings';
    }).then(f => { unlisten = f; });

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    const initApp = async () => {
      try {
        const store = await storeLoad('config.json', { autoSave: true });
        const provider = await store.get("activeProvider") || "openai";
        
        // Fetch and cache the models so they are instantly ready for the dropdown
        await fetchAndCacheModels(provider);
      } catch (err) {
        console.error("Startup error:", err);
      } finally {
        setAppReady(true);
      }
    };
    initApp();
  }, []);

  const handleCloseSettings = () => {
    window.location.hash = "";
    setPage('chat');
  };

  return (
    <>
      {!appReady && <Loading text={loadingText} />}
      {appReady && (
        <>
          <div style={{ display: page === 'chat' ? 'contents' : 'none' }}>
            <ChatApp />
          </div>
          {page === 'settings' && <SettingsPage onClose={handleCloseSettings} />}
        </>
      )}
    </>
  );
}

export default App;
