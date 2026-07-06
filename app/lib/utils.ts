import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createElement } from 'react';
import {
  Sun, Briefcase, Coffee, Laptop, Moon, Book,
  Dumbbell, Star, Zap, Folder, type LucideIcon,
} from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PROJECT_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
];

export function getColorFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}

export function getSoftCardStyle(color?: string | null) {
  if (!color || !color.trim()) {
    return { backgroundColor: 'hsl(var(--card))' };
  }

  return {
    background: `color-mix(in srgb, ${color} 8%, white)`,
    borderColor: `color-mix(in srgb, ${color} 45%, white)`,
  };
}

export function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const iconMap: Record<string, LucideIcon> = {
  sun: Sun,
  briefcase: Briefcase,
  coffee: Coffee,
  laptop: Laptop,
  moon: Moon,
  book: Book,
  gym: Dumbbell,
  dumbbell: Dumbbell,
  code: Laptop,
  study: Book,
  work: Briefcase,
  rest: Moon,
  sleep: Moon,
  morning: Sun,
  afternoon: Coffee,
  evening: Moon,
  night: Moon,
  star: Star,
  zap: Zap,
  folder: Folder,
};

export function getGroupIcon(icon: string | null): LucideIcon | null {
  if (!icon) return null;
  return iconMap[icon.toLowerCase()] || null;
}

export function GroupIcon({ icon, fallback: Fallback, className }: {
  icon: string | null;
  fallback: LucideIcon;
  className?: string;
}) {
  const Icon = getGroupIcon(icon) || Fallback;
  return createElement(Icon, { className });
}

export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json || typeof json !== 'string' || json.trim() === '') {
    return fallback;
  }
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    console.error('[safeJsonParse] Error parsing JSON:', error, 'Input:', json);
    return fallback;
  }
}
