export const colors = {
  // Primary
  white: '#FFFFFF',
  black: '#000000',
  brand: '#118ADD',       // AJ Blue
  brandLight: '#E8F4FD',
  accent: '#FA9000',      // AJ English Orange

  // Breaking / Alerts
  breaking: '#C31833',
  breakingLight: '#FDE8EC',
  error: '#E00102',
  
  // Grays
  gray900: '#1A1A1A',
  gray800: '#333333',
  gray700: '#4D4D4D',
  gray600: '#595959',
  gray500: '#808080',
  gray400: '#969696',
  gray300: '#B3B3B3',
  gray200: '#D9D9D9',
  gray100: '#E5E5E5',
  gray50: '#F0F0F0',
  gray25: '#F7F7F7',

  // Status
  success: '#0D7C3E',
  successLight: '#E6F5ED',
  warning: '#DBA200',
  warningLight: '#FFF8E5',
  info: '#1D9EB4',
  infoLight: '#E5F6F9',

  // Safety
  safetyRed: '#E00102',
  safetyGreen: '#0D7C3E',
} as const;

export const typography = {
  families: {
    primary: 'System',      // Will use system font on mobile
    heading: 'System',
    mono: 'monospace',
  },
  sizes: {
    xs: 11,
    sm: 12,
    caption: 14,
    body: 16,
    bodyLarge: 18,
    h4: 20,
    h3: 22,
    h2: 24,
    h1: 30,
    hero: 42,
  },
  weights: {
    light: '300' as const,
    regular: '400' as const,
    medium: '500' as const,
    bold: '700' as const,
    black: '900' as const,
  },
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 48,
} as const;

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 10,
  xl: 20,
  pill: 100,
  circle: 9999,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 5,
  },
} as const;

export const theme = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
} as const;

export type Theme = typeof theme;
