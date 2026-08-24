'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';
import { CheckCircle2, XCircle, Info } from 'lucide-react';
import { cn } from '@/app/lib/utils';

type ToastType = 'success' | 'error' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastOptions {
  action?: ToastAction;
  duration?: number;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info', options?: ToastOptions) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, action: options?.action }]);
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      setToasts(prev => prev.filter(t => t.id !== id));
    }, options?.duration ?? 4000);
    timersRef.current.set(id, timer);
  }, []);

  const getIcon = (type: ToastType) => {
    if (type === 'success') return <CheckCircle2 className="w-4 h-4" />;
    if (type === 'error') return <XCircle className="w-4 h-4" />;
    return <Info className="w-4 h-4" />;
  };

  const getColor = (type: ToastType) => {
    if (type === 'success') return 'bg-green-500 text-white';
    if (type === 'error') return 'bg-red-500 text-white';
    return 'bg-blue-500 text-white';
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-right-2",
              getColor(t.type)
            )}
          >
            {getIcon(t.type)}
            <span>{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="ml-1 underline font-semibold hover:opacity-80 transition-opacity"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
