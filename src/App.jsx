import "./App.css";
import SettingsPage from "./pages/Settings.jsx";
import ChatApp from "./pages/Chat.jsx";

// Detect which page this window should render
const isSettingsPage = new URLSearchParams(window.location.search).get('page') === 'settings';

function App() {
  return isSettingsPage ? <SettingsPage /> : <ChatApp />;
}

export default App;
