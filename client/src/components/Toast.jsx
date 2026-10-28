import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';

// Lightweight toast system: a provider at the app root plus a `useToast` hook.
// Toasts stack in the bottom-right corner, dismiss themselves, and can be closed
// by hand.

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
};

const DEFAULT_DURATION = 4200;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 220);
  }, []);

  const push = useCallback(
    (toast) => {
      const id = ++idRef.current;
      const entry = {
        id,
        tone: 'info',
        title: '',
        description: '',
        duration: DEFAULT_DURATION,
        ...toast,
      };
      setToasts((current) => [...current.slice(-3), entry]);
      if (entry.duration > 0) {
        setTimeout(() => dismiss(id), entry.duration);
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (title, description) => push({ tone: 'success', title, description }),
      error: (title, description) => push({ tone: 'error', title, description, duration: 6000 }),
      warning: (title, description) => push({ tone: 'warning', title, description }),
      info: (title, description) => push({ tone: 'info', title, description }),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="toast-viewport" role="region" aria-live="polite" aria-label="Notifications">
            {toasts.map((t) => {
              const Icon = ICONS[t.tone] || Info;
              return (
                <div
                  className={`toast ${t.tone} ${t.leaving ? 'leaving' : ''}`}
                  key={t.id}
                  role="status"
                >
                  <span className="toast-icon">
                    <Icon size={16} />
                  </span>
                  <div className="toast-content">
                    {t.title && <strong>{t.title}</strong>}
                    {t.description && <span>{t.description}</span>}
                  </div>
                  <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                    <X size={14} />
                  </button>
                  {t.duration > 0 && (
                    <span
                      className="toast-progress"
                      style={{ animationDuration: `${t.duration}ms` }}
                    />
                  )}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside a ToastProvider');
  return ctx;
}
