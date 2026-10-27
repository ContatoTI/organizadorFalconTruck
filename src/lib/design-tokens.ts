/**
 * Design Tokens — Fonte Única de Verdade Visual
 *
 * Este arquivo documenta e tipifica todos os tokens visuais do sistema.
 * Os valores aqui espelham exatamente as CSS custom properties em globals.css.
 *
 * QUANDO USAR ESTE ARQUIVO:
 *   - Bibliotecas de gráficos (recharts, chart.js) que precisam de cores JS
 *   - Canvas / SVG programático
 *   - Lógica condicional baseada em design (ex: escolher cor de categoria)
 *   - Referência centralizada ao criar novos componentes
 *
 * NÃO USE para estilização padrão — use classes Tailwind ou CSS variables.
 */

/* ── Paleta Base ────────────────────────────────────────────────────── */
export const surface = {
  background:    "hsl(210 40% 98%)",   /* #f8fafc — fundo da página */
  card:          "hsl(0 0% 100%)",     /* #ffffff — fundo de cards */
  popover:       "hsl(0 0% 100%)",     /* #ffffff — dropdowns e tooltips */
} as const;

export const text = {
  primary:       "hsl(222 47% 11%)",   /* #0f172a — texto principal */
  muted:         "hsl(215 16% 47%)",   /* #64748b — texto secundário */
} as const;

export const brand = {
  primary:       "hsl(221 83% 53%)",   /* #2563eb — azul principal */
  primaryLight:  "hsl(214 100% 97%)",  /* #eff6ff — azul suavíssimo (hover/accent) */
  destructive:   "hsl(0 72% 51%)",     /* #dc2626 — vermelho para ações destrutivas */
} as const;

export const borders = {
  default:       "hsl(210 28% 93%)",   /* #e8edf2 — borda padrão (DS border) */
} as const;

/* ── Cores de Categoria ─────────────────────────────────────────────── */
/**
 * Paleta de 8 cores para projetos, eventos de calendário, labels e badges.
 * Cada cor tem variante `solid` (fundo sólido, texto branco) e
 * `soft` (fundo suave, texto colorido) — ideal para eventos e badges.
 */
export const category = {
  blue: {
    solid: "hsl(217 91% 60%)",   /* #3b82f6 */
    bg:    "hsl(214 100% 97%)",  /* #eff6ff */
  },
  green: {
    solid: "hsl(142 71% 45%)",   /* #22c55e */
    bg:    "hsl(141 84% 93%)",   /* #dcfce7 */
  },
  coral: {
    solid: "hsl(14 100% 57%)",   /* #f97316 */
    bg:    "hsl(30 100% 95%)",   /* #fff7ed */
  },
  purple: {
    solid: "hsl(270 67% 60%)",   /* #a855f7 */
    bg:    "hsl(270 100% 97%)",  /* #faf5ff */
  },
  pink: {
    solid: "hsl(330 81% 60%)",   /* #ec4899 */
    bg:    "hsl(330 100% 96%)",  /* #fdf2f8 */
  },
  yellow: {
    solid: "hsl(43 96% 56%)",    /* #eab308 */
    bg:    "hsl(48 100% 95%)",   /* #fefce8 */
  },
  teal: {
    solid: "hsl(172 66% 50%)",   /* #14b8a6 */
    bg:    "hsl(170 76% 93%)",   /* #ccfbf1 */
  },
  red: {
    solid: "hsl(0 72% 51%)",     /* #ef4444 */
    bg:    "hsl(0 100% 96%)",    /* #fef2f2 */
  },
} as const;

export type CategoryColor = keyof typeof category;

/* Array para iteração (ex: seletor de cor de projeto) */
export const categoryColorList = Object.keys(category) as CategoryColor[];

/* ── Sombras ────────────────────────────────────────────────────────── */
export const shadows = {
  xs:    "0 1px 4px rgb(0 0 0 / 0.04)",                                        /* DS: listas de tarefas */
  sm:    "0 1px 3px rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
  md:    "0 2px 8px rgb(0 0 0 / 0.08)",                                         /* DS: sidebar logo, cards */
  lg:    "0 8px 40px rgb(0 0 0 / 0.12), 0 2px 4px rgb(0 0 0 / 0.05)",          /* DS: frames, modais */
  xl:    "0 20px 40px rgb(0 0 0 / 0.14), 0 4px 8px rgb(0 0 0 / 0.08)",
} as const;

/* ── Border Radius ──────────────────────────────────────────────────── */
export const radius = {
  sm:      "6px",    /* calc(var(--radius) - 4px) */
  md:      "8px",    /* calc(var(--radius) - 2px) */
  DEFAULT: "10px",   /* var(--radius) */
  lg:      "10px",   /* alias */
  xl:      "14px",   /* calc(var(--radius) + 4px) */
  "2xl":   "18px",   /* calc(var(--radius) + 8px) */
  full:    "9999px",
} as const;

/* ── Tipografia ─────────────────────────────────────────────────────── */
export const typography = {
  fontFamily: {
    /* Geist — injetado via next/font no layout.tsx como var(--font-sans) */
    sans: ["var(--font-sans)", "system-ui", "-apple-system", "sans-serif"],
  },
  fontWeight: {
    normal:   400,
    medium:   500,
    semibold: 600,
    bold:     700,
  },
  /* Escala de tamanhos — [tamanho, lineHeight] */
  fontSize: {
    xs:   ["0.75rem",   "1rem"],      /* 12px / 16px */
    sm:   ["0.875rem",  "1.25rem"],   /* 14px / 20px */
    base: ["1rem",      "1.5rem"],    /* 16px / 24px */
    lg:   ["1.125rem",  "1.75rem"],   /* 18px / 28px */
    xl:   ["1.25rem",   "1.75rem"],   /* 20px / 28px */
    "2xl":["1.5rem",    "2rem"],      /* 24px / 32px */
    "3xl":["1.875rem",  "2.25rem"],   /* 30px / 36px */
    "4xl":["2.25rem",   "2.5rem"],    /* 36px / 40px */
  },
} as const;

/* ── Transições ─────────────────────────────────────────────────────── */
export const transitions = {
  fast: "150ms ease",   /* hover simples */
  base: "200ms ease",   /* a maioria das interações */
  slow: "300ms ease",   /* painéis e modais */
} as const;

/* ── Z-Index ────────────────────────────────────────────────────────── */
export const zIndex = {
  sidebar:  10,
  header:   20,
  dropdown: 30,
  modal:    40,
  toast:    50,
} as const;

/* ── Helper: cor de categoria por índice ────────────────────────────── */
/**
 * Retorna uma cor de categoria baseada em índice numérico.
 * Útil para atribuir cores automaticamente a novos projetos/grupos.
 */
export function getCategoryByIndex(index: number): CategoryColor {
  return categoryColorList[index % categoryColorList.length];
}

/**
 * Retorna os tokens (solid + bg) de uma cor de categoria.
 */
export function getCategoryTokens(color: CategoryColor) {
  return category[color];
}
