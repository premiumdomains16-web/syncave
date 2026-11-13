import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';

type ToastKind = 'ok' | 'err';
interface Toast { id: number; kind: ToastKind; text: string; }

const ToastContext = createContext<(kind: ToastKind, text: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const notify = useCallback((kind: ToastKind, text: string) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => dismiss(id), kind === 'err' ? 6000 : 3500);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none w-[calc(100%-2rem)] max-w-md" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className={`pointer-events-auto w-full flex items-start gap-2.5 ps-3.5 pe-2.5 py-3 rounded-xl shadow-pop border text-sm backdrop-blur ${
                t.kind === 'ok' ? 'bg-brand-950/95 text-white border-white/10' : 'bg-white/95 text-red-800 border-red-200'
              }`}
              role={t.kind === 'err' ? 'alert' : 'status'}
            >
              <span className={`mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${t.kind === 'ok' ? 'bg-green-400/20' : 'bg-red-100'}`}>
                {t.kind === 'ok'
                  ? <CircleCheck className="w-3.5 h-3.5 text-green-400" />
                  : <CircleAlert className="w-3.5 h-3.5 text-red-600" />}
              </span>
              <span className="flex-1 pt-0.5 leading-snug">{t.text}</span>
              <button onClick={() => dismiss(t.id)} className={`p-1 rounded-md opacity-60 hover:opacity-100 transition-opacity ${t.kind === 'ok' ? 'hover:bg-white/10' : 'hover:bg-red-50'}`} aria-label="Dismiss">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
