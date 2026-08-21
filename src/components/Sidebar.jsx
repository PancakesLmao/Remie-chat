import { Settings, PanelLeftClose } from "lucide-preact";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function Sidebar({
  isFullscreen,
  isMobile,
  userName,
  renderMascots,
  openSettings,
  closeSidebar,
  isOverlaySidebar
}) {
  return (
    <div 
      class="mascot-side-panel" 
      data-tauri-drag-region 
      onPointerDown={(e) => {
        if (e.button === 0 && !e.target.closest('.settings-bar') && !e.target.closest('.close-sidebar-btn') && !isMobile) {
          getCurrentWindow().startDragging();
        }
      }}
    >
      {isOverlaySidebar && (
        <div class="close-sidebar-btn" onClick={closeSidebar} title="Close Sidebar">
          <PanelLeftClose size={20} />
        </div>
      )}

      {renderMascots(true)}
      
      <div class="settings-bar" onClick={openSettings}>
        <span class="user-name">{userName}</span>
        <div class="settings-gear" title="Settings">
          <Settings size={20} />
        </div>
      </div>
    </div>
  );
}
