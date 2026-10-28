import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Avatar } from './Avatar.jsx';

/* ============================================================
   Shared UI primitives used across the app
   ============================================================ */

export { Avatar };

/* ------------------------------------------------------------
   Page header
   ------------------------------------------------------------ */

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------
   Stat card
   ------------------------------------------------------------ */

export function StatCard({ label, value, hint, icon: Icon, tone = '', trend }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {Icon && (
          <span className={`icon-tile ${tone}`}>
            <Icon size={17} />
          </span>
        )}
      </div>
      <span className="stat-value">{value}</span>
      {(hint || trend) && (
        <span className="stat-hint">
          {trend && (
            <span className={`stat-trend ${trend.direction || 'up'}`}>
              {trend.direction === 'down' ? '▼' : '▲'} {trend.label}
            </span>
          )}
          {hint}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------
   Empty state
   ------------------------------------------------------------ */

export function EmptyState({ icon: Icon, title, description, action, tone = '' }) {
  return (
    <div className="empty-state">
      {Icon && (
        <div className={`icon-tile ${tone}`}>
          <Icon size={22} />
        </div>
      )}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------
   Section card
   ------------------------------------------------------------ */

export function SectionCard({
  title,
  description,
  icon: Icon,
  tone = '',
  actions,
  children,
  bodyClass = '',
  className = '',
  style,
}) {
  return (
    <section className={`card ${className}`.trim()} style={style}>
      <div className="card-header">
        <div className="card-title-row">
          {Icon && (
            <span className={`icon-tile ${tone}`}>
              <Icon size={18} />
            </span>
          )}
          <div>
            <h2>{title}</h2>
            {description && <p className="muted small">{description}</p>}
          </div>
        </div>
        {actions}
      </div>
      <div className={`card-body ${bodyClass}`.trim()}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------
   Segmented control
   ------------------------------------------------------------ */

export function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <option.icon size={14} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------
   Progress bar
   ------------------------------------------------------------ */

export function Progress({ value, tone = '' }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return (
    <div className={`progress ${tone}`.trim()} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------
   Modal
   ------------------------------------------------------------ */

export function Modal({
  open = true,
  onClose,
  title,
  subtitle,
  icon: Icon,
  tone = '',
  children,
  footer,
  width = '',
  closeOnBackdrop = true,
  labelledBy,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className={`modal ${width}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy || title}
        tabIndex={-1}
        ref={ref}
      >
        {(title || Icon) && (
          <div className="modal-head">
            {Icon && (
              <span className={`icon-tile ${tone}`}>
                <Icon size={18} />
              </span>
            )}
            <div>
              {title && <h2 className="section-title">{title}</h2>}
              {subtitle && <p className="muted small">{subtitle}</p>}
            </div>
            {onClose && (
              <button className="icon-btn" onClick={onClose} aria-label="Close">
                <X size={17} />
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------
   Copy-to-clipboard button
   ------------------------------------------------------------ */

export function CopyButton({ value, label = 'Copy', className = 'btn ghost sm' }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className={className} onClick={copy}>
      {copied ? 'Copied' : label}
    </button>
  );
}
