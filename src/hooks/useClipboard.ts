import { useState } from 'react';

/** Copies text and reports which key was copied for ~1.5s (for "Copied" button states). */
export function useClipboard() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      window.prompt('Copy this:', text);
    }
  };
  return { copied, copy };
}
