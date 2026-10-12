/**
 * Design tokens — Face Attendance client.
 * Green scale (emerald/teal/lime) replaces the old blue `primary`.
 * Loaded from `src/index.css` via `@config "../tailwind.config.js"` (Tailwind v4
 * does not pick up a JS config file automatically).
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // --- Green scale (50–950) — the app's brand ramp -----------------
        green: {
          50: '#f0fdf6',
          100: '#dcfcee',
          200: '#b6f7dc',
          300: '#7cefbe',
          400: '#3de3a1',
          500: '#16c985',
          600: '#0aa76d',
          700: '#08865a',
          800: '#0a6a4a',
          900: '#0a563e',
          950: '#032f22',
        },

        // --- Neutral text / surface tokens (dark-on-glass) ---------------
        ink: '#e9f6f0', // primary text
        muted: '#9fbbaf', // secondary text (AA on glass)
        paper: 'rgba(255,255,255,0.05)', // quiet surface / table header
        line: 'rgba(255,255,255,0.14)', // 1px glass border
        scrim: '#03130e', // modal / drawer backdrop base

        // --- Primary (emerald, bright on glass, dark ink on fills) -------
        primary: {
          DEFAULT: '#3de3a1', // accent text, icons, links
          dark: '#16c985', // hover for solid fills
          ink: '#032115', // text placed on solid primary fills
          soft: 'rgba(61,227,161,0.14)', // tinted highlight surface
          line: 'rgba(61,227,161,0.42)',
        },

        // --- Semantic statuses, retuned to sit on glass ------------------
        ok: {
          DEFAULT: '#3ddc97',
          dark: '#0b7a4f', // solid fill that carries white text
          soft: 'rgba(61,220,151,0.13)',
          line: 'rgba(61,220,151,0.38)',
        },
        warn: {
          DEFAULT: '#fbbf24',
          dark: '#8a5b09',
          soft: 'rgba(251,191,36,0.13)',
          line: 'rgba(251,191,36,0.38)',
        },
        bad: {
          DEFAULT: '#ff8f85',
          dark: '#b91c1c', // solid fill that carries white text
          soft: 'rgba(255,143,133,0.13)',
          line: 'rgba(255,143,133,0.38)',
        },
      },

      fontFamily: {
        sans: ['"Source Sans 3"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['"Source Serif 4"', 'Georgia', 'Cambria', 'serif'],
      },

      borderRadius: { panel: '14px', ctl: '8px' },

      // --- Glass shadows (layered: inner highlight + two drop layers) ----
      boxShadow: {
        glass:
          'inset 0 1px 0 0 rgba(255,255,255,0.08), 0 18px 40px -24px rgba(0,0,0,0.9), 0 4px 14px -8px rgba(0,0,0,0.55)',
        'glass-lg':
          'inset 0 1px 0 0 rgba(255,255,255,0.10), 0 32px 70px -34px rgba(0,0,0,0.95), 0 8px 22px -12px rgba(0,0,0,0.6)',
        'glass-pop':
          'inset 0 1px 0 0 rgba(255,255,255,0.12), 0 22px 50px -26px rgba(0,0,0,0.95), 0 6px 16px -10px rgba(0,0,0,0.6)',
        lift: 'inset 0 1px 0 0 rgba(255,255,255,0.10), 0 26px 50px -26px rgba(0,0,0,0.9), 0 8px 18px -10px rgba(0,0,0,0.5)',
      },

      backdropBlur: { glass: '14px', 'glass-lg': '22px' },
    },
  },
  plugins: [],
};
