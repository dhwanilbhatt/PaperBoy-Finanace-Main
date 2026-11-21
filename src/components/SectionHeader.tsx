import { Check, Copy, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import type { SectionId } from '../types/macro';
import { buildWhatsAppBrief } from '../utils/whatsappFormatter';

interface SectionHeaderProps {
  index: string;
  title: string;
  cadence: string;
  questionAnswered: string;
  sectionId: SectionId;
  onOpenWhatsApp: (sectionId: SectionId) => void;
}

export function SectionHeader({
  index,
  title,
  cadence,
  questionAnswered,
  sectionId,
  onOpenWhatsApp,
}: SectionHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyDirect = async () => {
    const brief = buildWhatsAppBrief(sectionId);
    try {
      await navigator.clipboard.writeText(brief.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onOpenWhatsApp(sectionId);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-5 border-b border-[#DDE4ED] dark:border-[#19324D] md:flex-row md:items-end md:justify-between">
      <div className="space-y-1.5 max-w-2xl min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#63768A] dark:text-slate-400 font-semibold">
          <span className="font-mono tabular-nums text-[#0D243C] dark:text-sky-300">
            {index}
          </span>
          <span aria-hidden="true">·</span>
          <span>{cadence}</span>
        </div>
        <h2
          className="text-2xl md:text-[31px] font-semibold tracking-tight leading-tight text-[#0D243C] dark:text-white"
          style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
        >
          {title}
        </h2>
        <p className="text-sm text-[#3A4E63] dark:text-slate-300 leading-relaxed">
          {questionAnswered}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
        <button
          type="button"
          onClick={() => onOpenWhatsApp(sectionId)}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold text-white bg-[#0D243C] hover:bg-[#163A5F] dark:bg-white dark:text-[#081829] dark:hover:bg-slate-100 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <MessageCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Send to WhatsApp</span>
        </button>
        <button
          type="button"
          onClick={handleCopyDirect}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold border border-[#DDE4ED] dark:border-[#19324D] bg-white dark:bg-[#0B1D31] text-[#0D243C] dark:text-slate-200 hover:border-[#9FB4C9] hover:bg-[#F6F8FB] dark:hover:bg-[#112A45] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-[#15803D] dark:text-emerald-400 shrink-0" aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Copy brief</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
