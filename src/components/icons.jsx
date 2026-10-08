// ツールバー・ダイアログ用の SVG アイコンと IconButton

export function IconButton({ onClick, disabled, title, children }) {
    return (
        <button
            type="button"
            className="icon-button"
            onClick={onClick}
            disabled={disabled}
            title={title}
        >
            {children}
        </button>
    );
}

export function ExportIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            <polyline points="8 8 12 4 16 8" />
            <line x1="12" y1="4" x2="12" y2="15" />
        </svg>
    );
}

export function AddFileIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
    );
}

export function UnloadIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
    );
}

export function ZoomResetIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
            <line x1="8" y1="11" x2="14" y2="11" />
            <line x1="11" y1="8" x2="11" y2="14" />
        </svg>
    );
}

export function LabelIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="4" y1="9" x2="20" y2="9" />
            <line x1="4" y1="15" x2="20" y2="15" />
            <line x1="10" y1="3" x2="8" y2="21" />
            <line x1="16" y1="3" x2="14" y2="21" />
        </svg>
    );
}

export function ReflectanceSpectrumIcon() {
    return (
        <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 18 L8 12 L12 15 L21 3" />
            <circle cx="3" cy="18" r="1.5" fill="currentColor" />
            <circle cx="8" cy="12" r="1.5" fill="currentColor" />
            <circle cx="12" cy="15" r="1.5" fill="currentColor" />
            <circle cx="21" cy="3" r="1.5" fill="currentColor" />
        </svg>
    );
}

export function XRDIcon() {
    return (
        <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {/* baseline (x-axis) */}
            <line x1="2" y1="20" x2="22" y2="20" strokeWidth="1.5" />
            {/* diffractogram-like peak pattern */}
            <path d="M2 20 L5 20 L6.2 10 L7.4 20 L10 20 L11 4 L12 20 L14.5 20 L15.5 13 L16.5 20 L19 20 L20 16 L21 20" />
        </svg>
    );
}

export function ThermometerIcon() {
    return (
        <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
            <circle cx="12" cy="17" r="1.5" fill="currentColor" />
        </svg>
    );
}

export function AutoDetectIcon() {
    return (
        <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="3" fill="currentColor" />
            <path d="M12 1v6m0 6v6M23 12h-6m-6 0H1" />
            <circle cx="12" cy="12" r="9" />
        </svg>
    );
}

export function ArrowUpIcon() {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 5l-5 5" />
            <path d="M12 5l5 5" />
            <path d="M12 5v14" />
        </svg>
    );
}

export function ArrowDownIcon() {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 19l-5-5" />
            <path d="M12 19l5-5" />
            <path d="M12 5v14" />
        </svg>
    );
}

export function NameIcon() {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M4 16l4-8 4 8" />
            <path d="M5.5 13h4" />
            <rect x="14" y="6" width="6" height="12" rx="1" />
            <path d="M15 9h4M15 13h4" />
        </svg>
    );
}

export function ExtIcon() {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="3" y="3" width="14" height="18" rx="2" />
            <path d="M17 7l4 4-4 4" />
            <line x1="6" y1="9" x2="12" y2="9" />
            <line x1="6" y1="13" x2="12" y2="13" />
        </svg>
    );
}

export function CustomOrderIcon() {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="8" cy="6" r="1" fill="currentColor" />
            <circle cx="16" cy="6" r="1" fill="currentColor" />
            <circle cx="8" cy="12" r="1" fill="currentColor" />
            <circle cx="16" cy="12" r="1" fill="currentColor" />
            <circle cx="8" cy="18" r="1" fill="currentColor" />
            <circle cx="16" cy="18" r="1" fill="currentColor" />
        </svg>
    );
}

export function AutoFitYIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <line x1="8" y1="8" x2="8" y2="16" />
            <polyline points="5 10 8 8 11 10" />
            <polyline points="5 14 8 16 11 14" />
            <path d="M14 12 L19 12" opacity="0.5" strokeDasharray="2 2" />
        </svg>
    );
}

export function StackIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 17 L8 12 L12 14 L21 7" />
            <path d="M3 12 L8 7 L12 9 L21 2" opacity="0.55" />
            <path d="M3 22 L8 17 L12 19 L21 12" opacity="0.55" />
        </svg>
    );
}

export function NormalizeIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 20 L3 4" />
            <path d="M3 20 L21 20" />
            <path d="M5 16 L10 9 L14 13 L20 5" />
            <line x1="3" y1="8" x2="5" y2="8" strokeDasharray="2 2" />
        </svg>
    );
}

export function UpdateIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
    );
}
