import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";

export type FeedbackTone = "neutral" | "success" | "error" | "danger";

export type FeedbackMessage = {
  title: string;
  message: string;
  detail?: string;
  tone?: FeedbackTone;
};

export type ConfirmationOptions = FeedbackMessage & {
  confirmLabel?: string;
  cancelLabel?: string;
};

export type TextRequestOptions = ConfirmationOptions & {
  label: string;
  initialValue?: string;
  placeholder?: string;
  helperText?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  validate?: (value: string) => string | null;
};

export type ToastOptions = FeedbackMessage & {
  duration?: number;
};

type MessageRequest = {
  id: number;
  kind: "message";
  options: FeedbackMessage & { acknowledgeLabel?: string };
  resolve: (value: void) => void;
};

type ConfirmationRequest = {
  id: number;
  kind: "confirmation";
  options: ConfirmationOptions;
  resolve: (value: boolean) => void;
};

type TextRequest = {
  id: number;
  kind: "text";
  options: TextRequestOptions;
  resolve: (value: string | null) => void;
};

type FeedbackRequest = MessageRequest | ConfirmationRequest | TextRequest;
type FeedbackResult = void | boolean | string | null;
type ToastRecord = ToastOptions & { id: number };

/**
 * Application-owned feedback for renderer flows. Dialog requests are queued so
 * callers can safely await user decisions without invoking browser-native UI.
 */
export function useAppFeedback() {
  const sequenceRef = useRef(0);
  const activeRef = useRef<FeedbackRequest | null>(null);
  const queueRef = useRef<FeedbackRequest[]>([]);
  const toastTimersRef = useRef(new Map<number, number>());
  const [active, setActive] = useState<FeedbackRequest | null>(null);
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const present = useCallback((request: FeedbackRequest) => {
    if (activeRef.current) {
      queueRef.current.push(request);
      return;
    }
    activeRef.current = request;
    setActive(request);
  }, []);

  const settle = useCallback((result: FeedbackResult) => {
    const current = activeRef.current;
    if (!current) return;
    activeRef.current = null;
    (current.resolve as (value: FeedbackResult) => void)(result);
    const next = queueRef.current.shift() ?? null;
    activeRef.current = next;
    setActive(next);
  }, []);

  const showMessage = useCallback((options: FeedbackMessage & { acknowledgeLabel?: string }) => (
    new Promise<void>((resolve) => {
      present({ id: ++sequenceRef.current, kind: "message", options, resolve });
    })
  ), [present]);

  const confirmAction = useCallback((options: ConfirmationOptions) => (
    new Promise<boolean>((resolve) => {
      present({ id: ++sequenceRef.current, kind: "confirmation", options, resolve });
    })
  ), [present]);

  const requestText = useCallback((options: TextRequestOptions) => (
    new Promise<string | null>((resolve) => {
      present({ id: ++sequenceRef.current, kind: "text", options, resolve });
    })
  ), [present]);

  const dismissToast = useCallback((id: number) => {
    const timer = toastTimersRef.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    toastTimersRef.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((options: ToastOptions) => {
    const id = ++sequenceRef.current;
    setToasts((current) => [...current.slice(-2), { ...options, id }]);
    const duration = Math.max(2000, options.duration ?? (options.tone === "error" || options.tone === "danger" ? 6500 : 4500));
    const timer = window.setTimeout(() => {
      toastTimersRef.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, duration);
    toastTimersRef.current.set(id, timer);
    return id;
  }, []);

  useEffect(() => () => {
    for (const timer of toastTimersRef.current.values()) window.clearTimeout(timer);
    toastTimersRef.current.clear();
    const outstanding = [activeRef.current, ...queueRef.current].filter((request): request is FeedbackRequest => Boolean(request));
    activeRef.current = null;
    queueRef.current = [];
    outstanding.forEach((request) => {
      if (request.kind === "message") request.resolve();
      else if (request.kind === "confirmation") request.resolve(false);
      else request.resolve(null);
    });
  }, []);

  return {
    showMessage,
    confirmAction,
    requestText,
    notify,
    host: <AppFeedbackHost active={active} toasts={toasts} onSettle={settle} onDismissToast={dismissToast} />,
  };
}

function AppFeedbackHost({
  active,
  toasts,
  onSettle,
  onDismissToast,
}: {
  active: FeedbackRequest | null;
  toasts: ToastRecord[];
  onSettle: (result: FeedbackResult) => void;
  onDismissToast: (id: number) => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {active ? <FeedbackDialog key={active.id} request={active} onSettle={onSettle} /> : null}
      <div className="app-toast-region" aria-label="Notifications" aria-live="polite" aria-relevant="additions removals">
        {toasts.map((toast) => <FeedbackToast key={toast.id} toast={toast} onDismiss={() => onDismissToast(toast.id)} />)}
      </div>
    </>,
    document.body,
  );
}

function FeedbackDialog({ request, onSettle }: { request: FeedbackRequest; onSettle: (result: FeedbackResult) => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const safeButtonRef = useRef<HTMLButtonElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState(request.kind === "text" ? request.options.initialValue ?? "" : "");
  const [error, setError] = useState("");
  const titleId = `app-feedback-title-${request.id}`;
  const descriptionId = `app-feedback-description-${request.id}`;
  const inputId = `app-feedback-input-${request.id}`;
  const errorId = `app-feedback-error-${request.id}`;
  const tone = request.options.tone ?? (request.kind === "confirmation" ? "danger" : "neutral");

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      if (request.kind === "text") {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (request.kind === "confirmation") safeButtonRef.current?.focus();
      else primaryButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (request.kind === "message") onSettle();
        else if (request.kind === "confirmation") onSettle(false);
        else onSettle(null);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown, true);
      const previous = previousFocusRef.current;
      if (previous?.isConnected) window.setTimeout(() => previous.focus(), 0);
    };
  }, [onSettle, request]);

  function cancel() {
    if (request.kind === "message") onSettle();
    else if (request.kind === "confirmation") onSettle(false);
    else onSettle(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (request.kind === "message") {
      onSettle();
      return;
    }
    if (request.kind === "confirmation") {
      onSettle(true);
      return;
    }
    const validationError = request.options.validate?.(value) ?? null;
    if (validationError) {
      setError(validationError);
      window.setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    onSettle(value);
  }

  const iconName: IconName = tone === "danger" ? "trash" : tone === "error" ? "warning" : tone === "success" ? "check" : request.kind === "text" ? "text" : "info";
  const confirmLabel = request.kind === "message"
    ? request.options.acknowledgeLabel ?? "OK"
    : request.options.confirmLabel ?? (request.kind === "text" ? "Continue" : "Confirm");

  return (
    <div className="app-feedback-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && request.kind !== "message") cancel();
    }}>
      <section
        ref={dialogRef}
        className={`app-feedback-dialog tone-${tone}`}
        role={request.kind === "message" && tone === "error" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <form onSubmit={submit} noValidate>
          <header className="app-feedback-header">
            <span className="app-feedback-symbol" aria-hidden="true"><Icon name={iconName} size={19} /></span>
            <div className="app-feedback-heading">
              <small>{request.kind === "text" ? "Input required" : tone === "danger" ? "Confirm change" : tone === "error" ? "Action needed" : "Kurogi Motion"}</small>
              <h2 id={titleId}>{request.options.title}</h2>
            </div>
            <button type="button" className="app-feedback-close" onClick={cancel} aria-label="Close dialog"><Icon name="close" size={16} /></button>
          </header>

          <div className="app-feedback-content">
            <p id={descriptionId}>{request.options.message}</p>
            {request.options.detail ? <p className="app-feedback-detail">{request.options.detail}</p> : null}
            {request.kind === "text" ? (
              <label className={`app-feedback-field ${error ? "has-error" : ""}`} htmlFor={inputId}>
                <span>{request.options.label}</span>
                <input
                  ref={inputRef}
                  id={inputId}
                  value={value}
                  placeholder={request.options.placeholder}
                  inputMode={request.options.inputMode}
                  aria-invalid={Boolean(error)}
                  aria-describedby={[request.options.helperText ? `${inputId}-helper` : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined}
                  onChange={(event) => {
                    setValue(event.currentTarget.value);
                    if (error) setError("");
                  }}
                />
                {request.options.helperText ? <small id={`${inputId}-helper`}>{request.options.helperText}</small> : null}
                {error ? <strong id={errorId} role="alert"><Icon name="warning" size={13} />{error}</strong> : null}
              </label>
            ) : null}
          </div>

          <footer className="app-feedback-footer">
            <span>{request.kind === "message" ? "Press Esc to close" : "You can cancel with Esc"}</span>
            <div>
              {request.kind !== "message" ? <button ref={safeButtonRef} type="button" className="app-feedback-secondary" onClick={cancel}>{request.options.cancelLabel ?? "Cancel"}</button> : null}
              <button ref={primaryButtonRef} type="submit" className={`app-feedback-primary ${tone === "danger" ? "is-danger" : ""}`}>{confirmLabel}</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}

function FeedbackToast({ toast, onDismiss }: { toast: ToastRecord; onDismiss: () => void }) {
  const tone = toast.tone ?? "neutral";
  const iconName: IconName = tone === "success" ? "check" : tone === "error" || tone === "danger" ? "warning" : "info";
  return (
    <article className={`app-toast tone-${tone}`} role={tone === "error" || tone === "danger" ? "alert" : "status"}>
      <span className="app-toast-symbol" aria-hidden="true"><Icon name={iconName} size={17} /></span>
      <span className="app-toast-copy"><strong>{toast.title}</strong><small>{toast.message}</small>{toast.detail ? <em title={toast.detail}>{toast.detail}</em> : null}</span>
      <button type="button" onClick={onDismiss} aria-label={`Dismiss ${toast.title}`}><Icon name="close" size={14} /></button>
    </article>
  );
}
