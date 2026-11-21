import { useState } from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-9 h-9',
  md: 'w-12 h-12',
  lg: 'w-16 h-16 sm:w-20 sm:h-20',
};

export function BrandLogo({ size = 'md', className = '' }: BrandLogoProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-full bg-white border-2 border-[#0D243C]/20 dark:border-white/30 overflow-hidden shrink-0 flex items-center justify-center shadow-[0_2px_8px_rgba(13,36,60,0.12)] ${className}`}
    >
      {failed ? (
        <svg
          viewBox="0 0 40 40"
          className="w-full h-full text-[#0D243C]"
          role="img"
          aria-label="Paper Boy Finance emblem"
        >
          <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2" />
          <text
            x="20"
            y="24"
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontWeight="700"
            fontSize="13"
            fill="currentColor"
          >
            PBF
          </text>
        </svg>
      ) : (
        <img
          src="./assets/aistudio/WhatsApp_Image_2026-11-09_at_6.50.34_AM_1cd717d3.jpeg"
          alt="Paper Boy Finance — Equity Research & Advisory"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover scale-[1.04]"
        />
      )}
    </div>
  );
}
