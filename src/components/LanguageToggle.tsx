import { useLanguage } from '../lib/LanguageContext';

interface Props {
  className?: string;
  /** 'pill' = compact chip (header use), 'full' = larger labeled button */
  variant?: 'pill' | 'full';
}

export default function LanguageToggle({ className = '', variant = 'pill' }: Props) {
  const { lang, toggle } = useLanguage();
  const isHindi = lang === 'hi';

  if (variant === 'full') {
    return (
      <button
        onClick={toggle}
        className={`flex items-center gap-2 px-4 py-3 rounded-2xl border font-black text-sm transition-all ${
          isHindi
            ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
            : 'bg-white/8 border-white/12 text-gray-300 hover:bg-white/12'
        } ${className}`}
      >
        <span className="text-base">{isHindi ? '🇬🇧' : '🇮🇳'}</span>
        <span>{isHindi ? 'Switch to English' : 'हिंदी में देखें'}</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      title={isHindi ? 'Switch to English' : 'हिंदी में बदलें'}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[11px] font-black transition-all ${
        isHindi
          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
          : 'bg-white/8 border-white/12 text-gray-400 hover:text-white hover:border-white/20'
      } ${className}`}
    >
      <span>{isHindi ? '🇬🇧' : '🇮🇳'}</span>
      <span>{isHindi ? 'EN' : 'हिंदी'}</span>
    </button>
  );
}
