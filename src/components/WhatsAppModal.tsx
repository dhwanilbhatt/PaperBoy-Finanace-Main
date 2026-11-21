import { Check, Copy, ExternalLink, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface WhatsAppModalProps {
  isOpen: boolean;
  title: string;
  initialText: string;
  onClose: () => void;
}

export function WhatsAppModal({ isOpen, title, initialText, onClose }: WhatsAppModalProps) {
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setText(initialText);
    setCopied(false);
  }, [initialText, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(text)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wa-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] shadow-xl flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[#DDE4ED] dark:border-[#19324D]">
          <div>
            <p className="text-xs text-[#47607A] dark:text-slate-400">
              Plain-text WhatsApp export · Zero markdown or tables
            </p>
            <h3
              id="wa-modal-title"
              className="text-base font-bold text-[#0D243C] dark:text-white mt-0.5"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close WhatsApp brief preview"
            className="p-2 text-[#47607A] hover:text-[#0D243C] dark:text-slate-400 dark:hover:text-white border border-[#DDE4ED] dark:border-[#19324D] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <label htmlFor="wa-brief-textarea" className="sr-only">
            Editable WhatsApp plain-text brief
          </label>
          <textarea
            id="wa-brief-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={15}
            className="w-full p-4 font-mono text-xs leading-relaxed text-[#0D243C] dark:text-slate-200 bg-[#F6F8FB] dark:bg-[#06111D] border border-[#DDE4ED] dark:border-[#19324D] focus:outline-2 focus:outline-[#0D243C] dark:focus:outline-slate-300 resize-y"
          />
          <p className="mt-2 text-xs text-[#47607A] dark:text-slate-400">
            Edit any line before copying. Formatted for group chat readability on mobile screens.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-[#DDE4ED] dark:border-[#19324D] bg-[#F6F8FB] dark:bg-[#081829]">
          <span className="font-mono text-xs text-[#47607A] dark:text-slate-400 tabular-nums">
            {text.length} chars · {text.split('\n').length} lines
          </span>
          <div className="flex items-center gap-3">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#0D243C] dark:text-slate-200 bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] hover:bg-[#EEF2F7] dark:hover:bg-[#122B47] transition-colors whitespace-nowrap shrink-0"
            >
              <span>Open WhatsApp</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0D243C] hover:bg-[#163A5F] dark:bg-white dark:text-[#06111D] dark:hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copied to clipboard</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copy Brief</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
