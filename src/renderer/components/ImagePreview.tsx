import { useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export function ImagePreview({ src, label }: { src: string; label: string }) {
  const [previewing, setPreviewing] = useState(false);

  return (
    <>
      <button
        aria-label={`查看${label}`}
        className="note-image-preview"
        onClick={() => setPreviewing(true)}
        title="查看图片"
        type="button"
      >
        <img alt="" className="content-image-thumbnail" draggable={false} src={src} />
      </button>
      <ImagePreviewDialog label={label} onClose={() => setPreviewing(false)} src={previewing ? src : null} />
    </>
  );
}

export function ImagePreviewDialog({ label, src, onClose }: { label: string; src: string | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    if (src && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [src]);

  if (!src) return null;

  return (
    <dialog aria-label={`${label}预览`} className="note-image-dialog" onClose={onClose} ref={dialog}>
      <form method="dialog">
        <button aria-label="关闭预览" type="submit"><X aria-hidden className="ui-icon" size={15} /></button>
      </form>
      <img alt={label} src={src} />
    </dialog>
  );
}
