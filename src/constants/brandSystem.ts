export const brandSystem = {
  identity: {
    name: 'CareLink.AI',
    personality: [
      'Calm',
      'Trusted',
      'Precise',
      'Human-centered',
      'Forward-looking',
      'Premium'
    ],
    story: 'CareLink.AI is a premium digital health experience that brings clarity, speed, and confidence to modern care journeys. It combines human empathy with intelligent infrastructure to make complex healthcare interactions feel effortless and trustworthy.',
    voice: {
      tone: 'Confident, reassuring, and elegant',
      principles: [
        'Write clearly and with calm authority',
        'Use language that feels human, not clinical',
        'Prioritize clarity over cleverness',
        'Sound modern, reassuring, and precise'
      ]
    },
    emotion: 'Security, calm, and confidence'
  },
  colors: {
    primary: {
      50: '#f4f8ff',
      100: '#e8f0ff',
      200: '#c8d9ff',
      300: '#9dbcff',
      400: '#6c9dff',
      500: '#4d84ff',
      600: '#2d6df5',
      700: '#1f55c8',
      800: '#1c46a1',
      900: '#183b81'
    },
    accent: {
      50: '#effcf9',
      100: '#c9f7ee',
      200: '#95f0df',
      300: '#5ce0cc',
      400: '#2dc8b4',
      500: '#16b6a6',
      600: '#0f8b82',
      700: '#0f6e6f',
      800: '#12595c',
      900: '#144b4f'
    },
    success: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e',
      600: '#16a34a',
      700: '#15803d',
      800: '#166534',
      900: '#14532d'
    },
    warning: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f'
    },
    error: {
      50: '#fef2f2',
      100: '#fee2e2',
      200: '#fecaca',
      300: '#fca5a5',
      400: '#f87171',
      500: '#ef4444',
      600: '#dc2626',
      700: '#b91c1c',
      800: '#991b1b',
      900: '#7f1d1d'
    },
    neutral: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a'
    },
    surface: {
      50: '#f9fbff',
      100: '#eef3ff',
      200: '#dfe8ff',
      300: '#c8d7ff',
      950: '#050816'
    }
  },
  typography: {
    display: 'Inter Tight, Inter, Segoe UI, sans-serif',
    body: 'Inter, Segoe UI, sans-serif',
    mono: 'JetBrains Mono, monospace',
    pairing: {
      heading: 'Inter Tight',
      body: 'Inter'
    },
    scale: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '2rem',
      '4xl': '2.5rem',
      '5xl': '3.25rem'
    }
  },
  radius: {
    sm: '0.5rem',
    md: '0.875rem',
    lg: '1.125rem',
    xl: '1.375rem',
    '2xl': '1.75rem',
    '3xl': '2rem'
  },
  shadows: {
    subtle: '0 10px 30px -20px rgba(2, 6, 23, 0.35)',
    soft: '0 16px 40px -24px rgba(2, 6, 23, 0.45)',
    premium: '0 20px 50px -24px rgba(15, 23, 42, 0.6)'
  },
  glass: {
    surface: 'rgba(15, 23, 42, 0.6)',
    border: 'rgba(255, 255, 255, 0.12)',
    blur: 'blur(20px)',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))'
  },
  iconStyle: 'Rounded, soft, slightly outlined, minimal stroke weight',
  illustrationStyle: 'Clean vector forms, calm gradients, subtle depth, clinical clarity',
  photographyStyle: 'Realistic, warm, human, high trust, natural light, soft contrast',
  gradients: {
    primary: 'linear-gradient(135deg, #4d84ff 0%, #16b6a6 100%)',
    hero: 'linear-gradient(135deg, rgba(77,132,255,0.24) 0%, rgba(22,182,166,0.2) 100%)',
    emergency: 'linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)'
  },
  buttonPhilosophy: 'Quiet confidence, strong hierarchy, minimal friction, calm contrast',
  cardPhilosophy: 'Readable, structured, premium depth, precise spacing, no visual noise',
  motionPhilosophy: 'Subtle, purposeful, calm, and efficient; never distracting',
  animationSpeed: {
    fast: '160ms',
    normal: '220ms',
    slow: '320ms'
  },
  hoverPhilosophy: 'Light elevation, subtle brightness, refined feedback, no aggressive motion',
  emptyStates: 'Calm visual clarity, helpful guidance, reassuring copy, clear next step',
  loadingPhilosophy: 'Quiet motion, low contrast, never flashy, always trustworthy',
  principles: {
    premiumUI: [
      'Prioritize clarity over decoration',
      'Use restraint to feel elevated',
      'Let spacing and hierarchy do the work'
    ],
    healthcareTrust: [
      'Signal reliability through calm consistency',
      'Avoid ambiguity in status and hierarchy',
      'Support fast comprehension in high-pressure moments'
    ],
    accessibility: [
      'Maintain readable contrast',
      'Support keyboard and screen-reader flows',
      'Ensure touch targets remain generous and clear'
    ]
  },
  designTokens: {
    colorBackground: '#050816',
    colorSurface: 'rgba(15, 23, 42, 0.68)',
    colorText: '#f8fafc',
    colorMuted: '#cbd5e1',
    colorBorder: 'rgba(255, 255, 255, 0.12)',
    colorBrand: '#4d84ff',
    colorAccent: '#16b6a6'
  },
  namingRules: {
    components: 'Use descriptive, product-oriented names such as PageHeader, InsightCard, TrustBadge',
    tokens: 'Use semantic names like colorBrand, textMuted, surfaceElevated',
    states: 'Use explicit state naming like default, hover, active, disabled, error, success'
  },
  spacing: {
    pagePadding: {
      mobile: '1rem',
      tablet: '1.5rem',
      desktop: '2rem',
      wide: '3rem'
    },
    sectionGap: {
      mobile: '1.5rem',
      tablet: '2rem',
      desktop: '3rem'
    }
  }
} as const;

export const brandDocumentation = {
  summary: 'CareLink.AI is a premium, human-centered healthcare brand that combines clinical trust with elegant digital calm.',
  usage: 'Use these tokens and principles to guide every UI decision, from layout to interaction states and content tone.'
};
