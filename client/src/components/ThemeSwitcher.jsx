import { useRef } from 'react';
import { useTheme } from '../utils/theme';

/** Row of colour dots. Arrow keys move between themes, like a radio group. */
export default function ThemeSwitcher({ compact = false, className = '' }) {
  const { theme, setTheme, themes } = useTheme();
  const refs = useRef([]);
  const active = themes.find((item) => item.id === theme) ?? themes[0];

  const onKeyDown = (event, index) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (index + step + themes.length) % themes.length;
    setTheme(themes[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div role="radiogroup" aria-label="Colour theme" className="theme-switch">
        {themes.map((item, index) => (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={theme === item.id}
            aria-label={`${item.label} theme`}
            title={`${item.label} theme`}
            tabIndex={theme === item.id ? 0 : -1}
            onClick={() => setTheme(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className="theme-dot"
            style={{ '--sw-a': item.accent, '--sw-b': item.bg }}
          />
        ))}
      </div>
      {!compact && <span className="text-xs font-semibold text-muted">{active.label}</span>}
    </div>
  );
}
