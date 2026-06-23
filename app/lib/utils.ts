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
