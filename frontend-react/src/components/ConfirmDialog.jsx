import { useEffect, useRef } from "react";

function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busyLabel = "Working...",
  busy = false,
  error = "",
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const handleKeyDown = (event) => {
    if (event.key === "Escape" && !busy) {
      onCancel();
    }
  };

  return (
    <div className="dialog-backdrop" onKeyDown={handleKeyDown}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
      >
        <h3 id="confirm-dialog-title">{title}</h3>

        <div id="confirm-dialog-body" className="dialog-body">
          {children}
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="dialog-actions">
          <button
            type="button"
            className="secondary-btn"
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>

          <button
            type="button"
            className="danger-btn"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
