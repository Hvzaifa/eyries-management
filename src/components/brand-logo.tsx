import Image from 'next/image';
import logo from '@/app/sixsigma-logo.png';
import mark from '@/app/icon.png';

/**
 * The Six Sigma Travels wordmark (owner, 2026-10-01). Static import, so Next
 * serves a resized copy rather than the 8000px original. Height is set by the
 * caller; the width follows the logo's 5:1 shape.
 *
 * `compact` is for the header: below the `sm` breakpoint there is no room for a
 * readable wordmark beside the menu, so phones get the swirl mark alone.
 */
export default function BrandLogo({
  className,
  priority,
  compact,
}: {
  className: string;
  priority?: boolean;
  compact?: boolean;
}) {
  const alt = 'Six Sigma Travels (Pvt) Ltd';
  if (!compact) return <Image src={logo} alt={alt} className={`w-auto shrink-0 ${className}`} priority={priority} />;
  return (
    <>
      <Image src={mark} alt={alt} className={`w-auto shrink-0 sm:hidden ${className}`} priority={priority} />
      <Image src={logo} alt={alt} className={`w-auto shrink-0 hidden sm:block ${className}`} priority={priority} />
    </>
  );
}
