import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface SafeImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
  fallbackIcon?: React.ReactNode;
}

export function SafeImage({
  src,
  alt,
  className = '',
  fallbackLabel,
  fallbackIcon,
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#0B1F3A] to-[#163661] text-[#E5BA41] select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        {fallbackIcon || <ImageOff className="w-5 h-5 opacity-80" />}
        {fallbackLabel && (
          <span className="mt-1 text-xs font-semibold tracking-wide text-white/90 px-2 text-center truncate max-w-full">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
