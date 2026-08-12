import { X } from "lucide-preact";

export default function ConfirmDialog({ title, message, confirmText = "Confirm", cancelText = "Cancel", onConfirm, onCancel, visible }) {
  if (!visible) return null;

  return (
    <div class="dialog-overlay">
      <div class="dialog-box">
        <div class="dialog-header">
          <h3>{title}</h3>
          <button class="icon-btn cancel-btn" onClick={onCancel} title="Close">
            <X size={16} />
          </button>
        </div>
        <div class="dialog-body">
          <p>{message}</p>
        </div>
        <div class="dialog-actions">
          <button class="dialog-btn secondary" onClick={onCancel}>{cancelText}</button>
          <button class="dialog-btn primary" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
