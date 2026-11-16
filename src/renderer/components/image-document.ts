import { CLIP_FRAGMENT_ATTRIBUTE, MAX_NOTE_IMAGE_BYTES, MAX_NOTE_IMAGES, type PinNote } from '../../shared/types';

// A zero-width character gives Chromium an IME caret at the end of an image line.
export const IMAGE_CARET = '\u2060';

export function transferredImage(transfer: DataTransfer) {
  const files = Array.from(transfer.files);
  return files.find(({ type }) => type === 'image/png' || type === 'image/jpeg')
    ?? files.find(({ type }) => type.startsWith('image/'));
}

export async function readImage(file: File) {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    throw new Error('请选择 PNG 或 JPG 图片');
  }
  if (file.size > MAX_NOTE_IMAGE_BYTES) {
    throw new Error('图片不能超过 8 MB');
  }
  try {
    const src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const preview = new Image();
    preview.src = src;
    await preview.decode();
    return src;
  } catch {
    throw new Error('无法读取这张图片');
  }
}

export function splitImageDocument(note: PinNote) {
  let start = 0;
  const blocks: { text: string; image?: { id: string; src: string } }[] = note.images.map(({ id, offset, src }) => {
    const text = note.text.slice(start, offset);
    start = offset + 1;
    return { text, image: { id, src: src ?? '' } };
  });
  return [...blocks, { text: note.text.slice(start) }];
}

export function createInlineImage({ id, src }: { id: string; src: string }) {
  const image = document.createElement('img');
  image.alt = '图片';
  image.className = 'content-image-thumbnail inline-editor-image';
  image.dataset.imageId = id;
  image.draggable = false;
  image.src = src;
  return image;
}

export function createEditableFragment(value: PinNote) {
  const fragment = document.createDocumentFragment();
  const blocks = splitImageDocument(value);
  for (const [index, { text, image }] of blocks.entries()) {
    if (text) fragment.append(text);
    if (image) {
      fragment.append(createInlineImage(image));
      const following = blocks[index + 1].text;
      if (!following || following.startsWith('\n')) fragment.append(IMAGE_CARET);
    }
  }
  return fragment;
}

export function readClipFragment(html: string): PinNote | null {
  if (!html.includes(CLIP_FRAGMENT_ATTRIBUTE)) return null;
  const template = document.createElement('template');
  template.innerHTML = html;
  const markup = template.content.querySelector(`[${CLIP_FRAGMENT_ATTRIBUTE}]`);
  if (!markup) return null;

  const value: PinNote = { text: '', images: [] };
  for (const child of markup.childNodes) {
    if (child instanceof Text) value.text += child.data;
    else if (child instanceof HTMLBRElement) value.text += '\n';
    else if (child instanceof HTMLImageElement) {
      const src = child.getAttribute('src') ?? '';
      if (src.length > Math.ceil(MAX_NOTE_IMAGE_BYTES / 3) * 4 + 23 || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(src)) return null;
      if (value.images.length >= MAX_NOTE_IMAGES) return null;
      value.images.push({ id: crypto.randomUUID(), offset: value.text.length, src });
      value.text += '\n';
    } else return null;
  }
  return value.images.length ? value : null;
}

export function readImageDocument(editor: HTMLElement): PinNote {
  const note: PinNote = { text: '', images: [] };
  const ids = new Set<string>();

  function readChildren(parent: Node) {
    let previous: ChildNode | undefined;
    for (const child of parent.childNodes) {
      const isBlock = child instanceof HTMLDivElement || child instanceof HTMLParagraphElement;
      if (previous && (isBlock || previous instanceof HTMLDivElement || previous instanceof HTMLParagraphElement)) {
        note.text += '\n';
      }
      if (child instanceof Text) {
        note.text += child.data.replaceAll(IMAGE_CARET, '').replaceAll('\u00a0', ' ');
      } else if (child instanceof HTMLBRElement) {
        // Chromium leaves a final break as a caret placeholder on empty lines.
        if (child.nextSibling) note.text += '\n';
      } else if (child instanceof HTMLImageElement && child.dataset.imageId) {
        let id = child.dataset.imageId;
        if (ids.has(id)) {
          id = crypto.randomUUID();
          child.dataset.imageId = id;
        }
        ids.add(id);
        note.images.push({ id, offset: note.text.length, src: child.src });
        note.text += '\n';
      } else {
        readChildren(child);
      }
      previous = child;
    }
  }

  readChildren(editor);
  return note;
}
