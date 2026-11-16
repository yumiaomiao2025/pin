import { useEffect, useRef, useState } from 'react';
import type { PinNote } from '../../../shared/types';
import { ImageDocumentEditor } from '../../components/ImageDocumentEditor';

export function NoteEditor() {
  const [initial, setInitial] = useState<PinNote | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const draft = useRef<PinNote | null>(null);
  const savedImages = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    void window.pinApi.getNote().then((note) => {
      if (!active) return;
      if (!note) {
        setLoadFailed(true);
        return;
      }
      savedImages.current = new Set(note.images.map(({ id }) => id));
      setInitial(note);
    }).catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, []);

  const save = (note: PinNote) => {
    const previousIds = new Set((draft.current ?? initial)?.images.map(({ id }) => id));
    draft.current = note;
    const images = note.images.map(({ id, offset, src }) => ({
      id, offset, src: previousIds.has(id) && savedImages.current.has(id) ? undefined : src,
    }));
    void window.pinApi.saveNote({ text: note.text, images }).then((ok) => {
      if (ok) savedImages.current = new Set(images.map(({ id }) => id));
      if (draft.current === note) setSaveFailed(!ok);
    }).catch(() => { if (draft.current === note) setSaveFailed(true); });
  };

  if (!initial) return loadFailed ? <p className="note-load-error" role="alert">无法加载便签</p> : null;

  return (
    <ImageDocumentEditor
      footer={saveFailed && <button onClick={() => { if (draft.current) save(draft.current); }} type="button">保存失败，重试</button>}
      initial={initial}
      mode="note"
      onChange={save}
    />
  );
}
