import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MAX_NOTE_IMAGES, type PinNote } from '../../shared/types';
import { OverlayScrollArea } from './OverlayScrollArea';
import { ImagePreviewDialog } from './ImagePreview';
import { createEditableFragment, createInlineImage, IMAGE_CARET, readClipFragment, readImage, readImageDocument, transferredImage } from './image-document';

function selectRange(range: Range) {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function insertionRange(editor: HTMLElement, range?: Range | null) {
  if (range && editor.contains(range.commonAncestorContainer)) return range.cloneRange();
  const end = document.createRange();
  end.selectNodeContents(editor);
  end.collapse(false);
  return end;
}

function selectedRange() {
  const selection = window.getSelection();
  return selection?.rangeCount ? selection.getRangeAt(0) : null;
}

function isEditorImage(node: Node | null | undefined): node is HTMLImageElement {
  return node instanceof HTMLImageElement && Boolean(node.dataset.imageId);
}

function placeCaretAfterImage(image: HTMLImageElement) {
  let text = image.nextSibling;
  if (!(text instanceof Text) || text.data === '' || text.data.startsWith('\n')) {
    text = document.createTextNode(IMAGE_CARET);
    image.after(text);
  }
  window.getSelection()?.collapse(text, text.textContent?.startsWith(IMAGE_CARET) ? 1 : 0);
}

function focusImageBoundary(editor: HTMLElement) {
  const range = selectedRange();
  if (!range?.collapsed || !editor.contains(range.startContainer)) return;
  const { startContainer, startOffset } = range;
  const previous = startContainer instanceof Text
    ? (startOffset === 0 ? startContainer.previousSibling : null)
    : startContainer.childNodes[startOffset - 1];
  if (isEditorImage(previous)) placeCaretAfterImage(previous);
}

function imageCapacity(editor: HTMLElement, selection: Range) {
  return MAX_NOTE_IMAGES - Array.from(editor.querySelectorAll('img[data-image-id]')).filter((image) => !selection.intersectsNode(image)).length;
}

export function ImageDocumentEditor({ initial, mode, autoFocus, busy, footer, onChange, onCommit, onCancel }: {
  initial: PinNote;
  mode: 'note' | 'todo-edit' | 'todo-create' | 'clip-edit' | 'clip-create';
  autoFocus?: boolean;
  busy?: boolean;
  footer?: ReactNode;
  onChange?: (document: PinNote) => void;
  onCommit?: (document: PinNote) => void;
  onCancel?: () => void;
}) {
  const [imageError, setImageError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const initialDocument = useRef(initial);
  const readingImage = useRef(false);
  const composing = useRef(false);
  const pendingCommit = useRef(false);
  const fieldStyle = {
    note: { label: '便签正文', textClass: 'note-editor', kind: 'note', editing: false },
    'todo-edit': { label: '编辑待办', textClass: 'todo-text todo-document-text', kind: 'todo', editing: true },
    'todo-create': { label: '新增待办', textClass: 'todo-input todo-document-text', kind: 'todo', editing: false },
    'clip-edit': { label: '编辑剪贴条目', textClass: 'clip-text clip-text--editing', kind: 'clip', editing: true },
    'clip-create': { label: '新增剪贴条目', textClass: 'clip-input', kind: 'clip', editing: false },
  }[mode];

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.replaceChildren(createEditableFragment(initialDocument.current));
  }, []);

  useLayoutEffect(() => {
    if (autoFocus) editorRef.current?.focus();
  }, [autoFocus]);

  const publish = (editor: HTMLDivElement) => {
    const value = readImageDocument(editor);
    editor.toggleAttribute('data-empty', !value.text && value.images.length === 0);
    onChange?.(value);
  };

  const commit = () => {
    if (!busy && !readingImage.current && !composing.current && editorRef.current) {
      onCommit?.(readImageDocument(editorRef.current));
    }
  };

  const addImage = async (editor: HTMLDivElement, file: File, range: Range) => {
    if (busy || readingImage.current) return;
    setImageError('');
    if (imageCapacity(editor, range) < 1) {
      setImageError(`最多插入 ${MAX_NOTE_IMAGES} 张图`);
      return;
    }

    readingImage.current = true;
    let src: string;
    try {
      src = await readImage(file);
    } catch (error) {
      if (editor.isConnected && error instanceof Error) setImageError(error.message);
      return;
    } finally {
      readingImage.current = false;
    }
    if (!editor.isConnected) return;

    const image = createInlineImage({ id: crypto.randomUUID(), src });
    editor.focus();
    const insertion = insertionRange(editor, range);
    insertion.deleteContents();
    insertion.insertNode(image);
    placeCaretAfterImage(image);
    publish(editor);
  };

  const field = (
    <div
      aria-label={fieldStyle.label}
      aria-multiline="true"
      aria-readonly={busy || undefined}
      className={`${fieldStyle.textClass} inline-image-editor`}
      contentEditable={!busy}
      data-placeholder={!fieldStyle.editing ? '写点什么…' : undefined}
      onCompositionEnd={(event) => {
        composing.current = false;
        const editor = event.currentTarget;
        queueMicrotask(() => {
          if (!editor.isConnected || composing.current) return;
          publish(editor);
          if (pendingCommit.current) {
            pendingCommit.current = false;
            commit();
          }
        });
      }}
      onCompositionStart={(event) => {
        composing.current = true;
        event.currentTarget.removeAttribute('data-empty');
      }}
      onDoubleClick={(event) => {
        if (event.target instanceof HTMLImageElement && event.target.dataset.imageId) setPreview(event.target.src);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
      }}
      onDrop={(event) => {
        const { currentTarget: editor, dataTransfer } = event;
        const hasFiles = dataTransfer.types.includes('Files');
        if (!hasFiles && !dataTransfer.types.includes('text/html')) return;
        event.preventDefault();
        if (busy) return;
        const range = insertionRange(editor, document.caretRangeFromPoint(event.clientX, event.clientY) ?? selectedRange());
        if (hasFiles) {
          const file = transferredImage(dataTransfer);
          if (file) void addImage(editor, file, range);
        } else {
          editor.focus();
          selectRange(range);
          document.execCommand('insertText', false, dataTransfer.getData('text/plain'));
        }
      }}
      onInput={(event) => {
        if (!composing.current && !(event.nativeEvent instanceof InputEvent && event.nativeEvent.isComposing)) {
          publish(event.currentTarget);
        }
      }}
      onKeyDown={(event) => {
        if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        if (event.key === 'Backspace') {
          const range = selectedRange();
          if (range?.collapsed && range.startOffset === 1 && range.startContainer instanceof Text
            && range.startContainer.data.startsWith(IMAGE_CARET) && isEditorImage(range.startContainer.previousSibling)) {
            window.getSelection()?.collapse(range.startContainer, 0);
          }
        }
        if ((event.ctrlKey || event.metaKey) && /^[biu]$/i.test(event.key)) event.preventDefault();
        if (event.key === 'Escape' && onCancel) {
          event.preventDefault();
          onCancel();
        } else if (event.key === 'Enter' && !event.shiftKey && onCommit) {
          event.preventDefault();
          commit();
        }
      }}
      onMouseUp={(event) => {
        if (!busy && !composing.current && event.button === 0 && !event.shiftKey) focusImageBoundary(event.currentTarget);
      }}
      onPaste={(event) => {
        event.preventDefault();
        if (busy || readingImage.current) return;
        const editor = event.currentTarget;
        const range = insertionRange(editor, selectedRange());
        const clip = readClipFragment(event.clipboardData.getData('text/html'));
        if (clip) {
          if (imageCapacity(editor, range) < clip.images.length) {
            setImageError(`最多插入 ${MAX_NOTE_IMAGES} 张图`);
            return;
          }
          setImageError('');
          const fragment = createEditableFragment(clip);
          const last = fragment.lastChild;
          range.deleteContents();
          range.insertNode(fragment);
          if (last) {
            range.setStartAfter(last);
            range.collapse(true);
            selectRange(range);
          }
          publish(editor);
          return;
        }
        const file = transferredImage(event.clipboardData);
        if (file) {
          void addImage(editor, file, range);
        } else {
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
        }
      }}
      ref={editorRef}
      role="textbox"
    />
  );

  return (
    <div
      className={`document-editor document-editor--${fieldStyle.kind}`}
      onBlur={fieldStyle.editing ? (event) => {
        if (event.currentTarget.contains(event.relatedTarget) || preview) return;
        if (composing.current) pendingCommit.current = true;
        else commit();
      } : undefined}
    >
      {mode === 'note' ? <OverlayScrollArea className="note-content">{field}</OverlayScrollArea> : <div className="document-fields">{field}</div>}
      <ImagePreviewDialog label="图片" onClose={() => setPreview(null)} src={preview} />
      {(imageError || footer) && (
        <div className="document-status">
          {imageError && <span role="alert">{imageError}</span>}
          {footer}
        </div>
      )}
    </div>
  );
}
