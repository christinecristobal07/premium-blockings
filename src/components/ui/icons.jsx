// Small stroke icons (16px), colored by currentColor.
const Svg = ({ children, ...p }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0" {...p}>{children}</svg>
);
export const SunIcon = () => <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>;
export const MoonIcon = () => <Svg><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Svg>;
export const DownloadIcon = () => <Svg><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></Svg>;
export const HistoryIcon = () => <Svg><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" /></Svg>;
export const UsersIcon = () => <Svg><circle cx="9" cy="8" r="4" /><path d="M2 21v-1a6 6 0 0 1 12 0v1M16 4a4 4 0 0 1 0 8M22 21v-1a6 6 0 0 0-4-5.7" /></Svg>;
export const PlusIcon = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
export const UserIcon = () => <Svg><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a8 8 0 0 1 16 0v1" /></Svg>;
export const EditIcon = () => <Svg><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>;
export const MoreIcon = () => <Svg><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Svg>;
export const TrashIcon = () => <Svg><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></Svg>;
export const MapIcon = () => <Svg><path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3zM9 3v15M15 6v15" /></Svg>;
