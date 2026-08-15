import { useState, useEffect } from 'preact/hooks';
import "./App.css";
import SettingsPage from "./pages/Settings.jsx";
import ChatApp from "./pages/Chat.jsx";

// Detect which page this window should render on desktop
const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent) || (window.__TAURI_INTERNALS__ && ["android", "ios"].includes(window.__TAURI_INTERNALS__.platform));
const isSettingsWindow = !isMobile && new URLSearchParams(window.location.search).get('page') === 'settings';

function App() {
  const [page, setPage] = useState(isSettingsWindow ? 'settings' : (window.location.hash === '#settings' ? 'settings' : 'chat'));

  useEffect(() => {
    if (navigator.userAgent.includes("Android") || navigator.userAgent.includes("iPhone") || navigator.userAgent.includes("iPad")) {
      document.body.classList.add("mobile-device");
    }
    const handleHashChange = () => {
      if (!isSettingsWindow) {
        setPage(window.location.hash === '#settings' ? 'settings' : 'chat');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleCloseSettings = () => {
    window.location.hash = "";
    setPage('chat');
  };

  return (
    <>
      <div style={{ display: page === 'chat' ? 'contents' : 'none' }}>
        <ChatApp />
      </div>
      {page === 'settings' && <SettingsPage onClose={handleCloseSettings} />}
    </>
  );
}

export default App;
