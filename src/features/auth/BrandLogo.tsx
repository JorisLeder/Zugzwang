import { BrandMark } from '@/app/shell/BrandMark';
import { APP_DE } from '@/app/strings.de';

/** Brand mark + name on the bare auth pages (no shell). */
export function BrandLogo() {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <BrandMark className="size-8" />
      <span className="text-h3 text-text">{APP_DE.brand}</span>
    </div>
  );
}
