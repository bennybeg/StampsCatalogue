import { useEffect, useState } from 'react';

/** An <img> for a Blob, revoking its object URL when it changes or unmounts. */
export function BlobImg({ blob, className, alt = '' }: { blob?: Blob; className?: string; alt?: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob || typeof URL.createObjectURL !== 'function') return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} className={className} alt={alt} /> : <span className={className} />;
}
