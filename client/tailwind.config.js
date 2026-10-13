/**
 * Design tokens — Face Attendance client (terminal theme).
 * Green scale (emerald/teal/lime) replaces the old blue `primary`.
 * Loaded from `src/index.css` via `@config "../tailwind.config.js"` (Tailwind v4
 * does not pick up a JS config file automatically).
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // --- Green scale (50–950): pure phosphor ramp sampled from the reference palette -----------------
        green: {
          50: '#eaffe6',
          100: '#c6ffc0',
          200: '#94ff8a',
          300: '#5cff4f',
          400: '#2bff1f',
          500: '#00ff00',
          600: '#00cc00',
          700: '#049b00',
          800: '#005200',
          900: '#013b00',
          950: '#001900',
        },

        // --- Neutral text / surface tokens (dark-on-glass) ---------------
        ink: '#c6ffc0', // primary text
        muted: '#5fc455', // secondary text (AA on the dark panel)
        paper: 'rgba(79,242,166,0.05)', // quiet surface / table header
        line: 'rgba(79,242,166,0.16)', // 1px phosphor border
        scrim: '#011000', // modal / drawer backdrop base

        // --- Primary (emerald, bright on glass, dark ink on fills) -------
        primary: {
          DEFAULT: '#4ff2a6', // accent text, icons, links
          dark: '#2fd88b', // hover for solid fills
          ink: '#02150c', // text placed on solid primary fills
          soft: 'rgba(79,242,166,0.12)', // tinted highlight surface
          line: 'rgba(79,242,166,0.45)',
        },

        // --- Semantic statuses, retuned to sit on glass ------------------
        ok: {
          DEFAULT: '#3dff3d',
          dark: '#007a00', // solid fill that carries white text
          soft: 'rgba(61,255,61,0.13)',
          line: 'rgba(61,255,61,0.4)',
        },
        warn: {
          DEFAULT: '#ffb454',
          dark: '#8a5b09',
          soft: 'rgba(251,191,36,0.13)',
          line: 'rgba(251,191,36,0.38)',
        },
        bad: {
          DEFAULT: '#ff7b72',
          dark: '#b91c1c', // solid fill that carries white text
          soft: 'rgba(255,143,133,0.13)',
          line: 'rgba(255,143,133,0.38)',
        },
      },

      fontFamily: {
        sans: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        // Headings use `font-serif` across the app; it now maps to the same mono family.
        serif: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },

      borderRadius: { panel: '6px', ctl: '3px' },

      // --- Panel shadows (flat: hairline highlight + one drop layer) -----
      boxShadow: {
        glass: 'inset 0 1px 0 0 rgba(79,242,166,0.06), 0 14px 34px -22px rgba(0,0,0,0.95)',
        'glass-lg': 'inset 0 1px 0 0 rgba(79,242,166,0.08), 0 28px 60px -30px rgba(0,0,0,1)',
        'glass-pop': 'inset 0 1px 0 0 rgba(79,242,166,0.1), 0 24px 54px -28px rgba(0,0,0,1)',
        lift: 'inset 0 0 0 1px rgba(79,242,166,0.3), 0 14px 34px -22px rgba(0,0,0,0.95)',
      },

      
    },
  },
  plugins: [],
};
