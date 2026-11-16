import { createHash, randomUUID } from 'node:crypto';
import { clipboard, ClipboardItem, nativeImage, type IpcMainInvokeEvent } from 'electron';
import { type Todo, type ClipItem, type DocumentImage, type Widget } from '../database/schema';
import { CLIP_FRAGMENT_ATTRIBUTE, MAX_NOTE_IMAGE_BYTES, type PinClipItem, type PinNote, type PinNoteImage, type PinTodo } from '../../shared/types';
import type { AppDatabaseService } from '../database/app-service';
import type { DocumentImageRepository } from '../database/repositories';
import type { WindowManager } from '../window-manager';
import { widgetIdForEvent, isManagerEvent } from '../windows/identities';

type ContentDependencies = {
  cancelWidgetPersist(widgetId: string): void;
  closeWidget(widgetId: string): void;
  onWidgetDeleted(widgetId: string): void;
  openWidget(widgetId: string): unknown;
  broadcastWidget(widget: Widget): void;
};

type ContentActions = Pick<WindowManager,
  | 'restoreWidget' | 'getTodosForEvent' | 'createTodo' | 'updateTodo'
  | 'deleteTodo' | 'restoreTodo' | 'reorderTodos' | 'getClipsForEvent'
  | 'createClip' | 'updateClip' | 'deleteClip' | 'restoreClip'
  | 'reorderClips' | 'copyClip' | 'getNote' | 'saveNote' | 'setActiveTab'
> & {
  deleteWidgetById(widgetId: string): Widget | undefined;
  clearUndo(): void;
};

function decodeImage(src?: string): Pick<DocumentImage, 'mime' | 'data'> {
  const separator = src?.indexOf(',') ?? -1;
  const header = src?.slice(0, separator);
  const mime = header === 'data:image/png;base64' ? 'image/png' : 'image/jpeg';
  if (!src || separator < 0 || (header !== 'data:image/png;base64' && header !== 'data:image/jpeg;base64')
    || src.length - separator - 1 > Math.ceil(MAX_NOTE_IMAGE_BYTES / 3) * 4) {
    throw new Error('Invalid image');
  }
  const data = Buffer.from(src.slice(separator + 1), 'base64');
  const signature = mime === 'image/png' ? '89504e470d0a1a0a' : 'ffd8ff';
  if (data.length > MAX_NOTE_IMAGE_BYTES || !data.toString('hex', 0, signature.length / 2).startsWith(signature)
    || nativeImage.createFromBuffer(data).isEmpty()) {
    throw new Error('Invalid image');
  }
  return { mime, data };
}

function imageSource({ mime, data }: Pick<DocumentImage, 'mime' | 'data'>) {
  return `data:${mime};base64,${data.toString('base64')}`;
}

function presentDocumentImage(image: DocumentImage): PinNoteImage {
  return { id: image.id, offset: image.offset, src: imageSource(image) };
}

function saveDocumentImages(repository: DocumentImageRepository, ownerId: string, images: PinNoteImage[], prepared?: DocumentImage[]) {
  const previous = new Map(repository.listPositions(ownerId).map(({ id, offset }) => [id, offset]));
  for (const { id, offset, src } of images) {
    const oldOffset = previous.get(id);
    if (oldOffset === undefined) {
      repository.create({ id, ownerId, offset, ...(prepared?.find((image) => image.id === id) ?? decodeImage(src)) });
    } else if (oldOffset !== offset) {
      repository.move(ownerId, id, offset);
    }
    previous.delete(id);
  }
  for (const id of previous.keys()) repository.delete(ownerId, id);
}

function presentClip(clip: ClipItem, images: DocumentImage[] = []): PinClipItem {
  const { id, widgetId, sortOrder, createdAt, updatedAt } = clip;
  return { id, widgetId, sortOrder, createdAt, updatedAt, text: clip.documentText ?? clip.text, images: images.map(presentDocumentImage) };
}

function prepareClip(document: PinNote, ownerId: string, previous: DocumentImage[] = []): {
  images: DocumentImage[];
  fields: Pick<ClipItem, 'kind' | 'documentText' | 'text'>;
} {
  const images = document.images.map(({ id, offset, src }) => {
    const stored = previous.find((image) => image.id === id);
    const { mime, data } = stored ?? decodeImage(src);
    return { id, ownerId, offset, mime, data };
  });
  if (!images.length) return { images, fields: { kind: 'text', documentText: null, text: document.text } };

  const hashes = images.map(({ offset, data }) => [offset, createHash('sha256').update(data).digest('hex')] as const);
  // Retain the deduplication key used by existing single-image clips.
  const hash = document.text === '\n' && images.length === 1
    ? hashes[0][1]
    : createHash('sha256').update(JSON.stringify([document.text, hashes])).digest('hex');
  return { images, fields: { kind: 'image', documentText: document.text, text: hash } };
}

function clipboardDocument(text: string, images: DocumentImage[]) {
  const htmlText = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>');
  let start = 0;
  let plain = '';
  let html = '';
  for (const image of images) {
    const before = text.slice(start, image.offset);
    plain += before;
    html += `${htmlText(before)}<img src="${imageSource(image)}" alt="">`;
    start = image.offset + 1;
  }
  const after = text.slice(start);
  return { plain: plain + after, html: `<div ${CLIP_FRAGMENT_ATTRIBUTE}="" style="white-space:pre-wrap">${html}${htmlText(after)}</div>` };
}

export function createContentActions(service: AppDatabaseService, dependencies: ContentDependencies): ContentActions {
  const { cancelWidgetPersist, closeWidget, onWidgetDeleted, openWidget, broadcastWidget } = dependencies;
  let contentTrash:
    | { kind: 'todo'; widgetId: string; item: Todo; images: DocumentImage[]; timer: ReturnType<typeof setTimeout> }
    | { kind: 'clip'; widgetId: string; item: ClipItem; images: DocumentImage[]; timer: ReturnType<typeof setTimeout> }
    | { kind: 'widget'; item: Widget; todos: Todo[]; clips: ClipItem[]; images: DocumentImage[];
      todoImages: DocumentImage[]; clipImages: DocumentImage[]; timer: ReturnType<typeof setTimeout> }
    | undefined;

  const todoForEvent = (event: IpcMainInvokeEvent, todoId: string) => {
    const widgetId = widgetIdForEvent(event);
    if (!widgetId) {
      return undefined;
    }
    const todo = service.todos.getById(todoId);
    return todo?.widgetId === widgetId ? todo : undefined;
  };

  const clipForEvent = (event: IpcMainInvokeEvent, clipId: string) => {
    const widgetId = widgetIdForEvent(event);
    if (!widgetId) {
      return undefined;
    }
    const clip = service.clipItems.getById(clipId);
    return clip?.widgetId === widgetId ? clip : undefined;
  };

  const contentWidgetForEvent = (event: IpcMainInvokeEvent, type: 'note' | 'todo' | 'clip') => {
    const widgetId = widgetIdForEvent(event);
    const widget = widgetId ? service.widgets.getById(widgetId) : undefined;
    return widget?.type === type || widget?.type === 'desk' ? widget : undefined;
  };

  const presentTodos = (todos: Todo[]): PinTodo[] => {
    const imagesByTodo = new Map<string, PinNoteImage[]>();
    for (const image of service.todoImages.listForOwners(todos.map(({ id }) => id))) {
      const next = presentDocumentImage(image);
      const images = imagesByTodo.get(image.ownerId);
      if (images) images.push(next);
      else imagesByTodo.set(image.ownerId, [next]);
    }
    return todos.map((todo) => ({ ...todo, images: imagesByTodo.get(todo.id) }));
  };

  const presentClips = (clips: ClipItem[]): PinClipItem[] => {
    const images = service.clipImages.listForOwners(clips.filter(({ kind }) => kind === 'image').map(({ id }) => id));
    return clips.map((clip) => presentClip(clip, images.filter(({ ownerId }) => ownerId === clip.id)));
  };

  const deleteWidgetById = (widgetId: string) => {
    const widget = service.widgets.getById(widgetId);
    if (!widget) {
      return undefined;
    }

    if (contentTrash) {
      clearTimeout(contentTrash.timer);
    }
    cancelWidgetPersist(widgetId);

    const todos = service.todos.listByWidget(widgetId);
    const clips = service.clipItems.listByWidget(widgetId);
    const images = service.noteImages.list(widgetId);
    const todoImages = service.todoImages.listForOwners(todos.map(({ id }) => id));
    const clipImages = service.clipImages.listForOwners(clips.filter(({ kind }) => kind === 'image').map(({ id }) => id));
    closeWidget(widgetId);
    service.widgets.delete(widgetId);
    onWidgetDeleted(widgetId);

    const timer = setTimeout(() => {
      if (contentTrash?.kind === 'widget' && contentTrash.item.id === widget.id) {
        contentTrash = undefined;
      }
    }, 5_000);
    contentTrash = { kind: 'widget', item: widget, todos, clips, images, todoImages, clipImages, timer };
    return widget;
  };
  const clearUndo = () => {
    if (contentTrash) {
      clearTimeout(contentTrash.timer);
      contentTrash = undefined;
    }
  };
  return {
    deleteWidgetById,
    clearUndo,
    restoreWidget: (event) => {
      if (!isManagerEvent(event) || !contentTrash || contentTrash.kind !== 'widget') {
        return undefined;
      }
      const { item: widget, todos, clips, images, todoImages, clipImages, timer } = contentTrash;
      clearTimeout(timer);
      contentTrash = undefined;
      service.transaction(({ widgets, todos: todoRepository, clipItems, noteImages, todoImages: todoImageRepository, clipImages: clipImageRepository }) => {
        widgets.create(widget);
        todos.forEach((todo) => todoRepository.create(todo));
        clips.forEach((clip) => clipItems.create(clip));
        images.forEach((image) => noteImages.create(image));
        todoImages.forEach((image) => todoImageRepository.create(image));
        clipImages.forEach((image) => clipImageRepository.create(image));
      });
      openWidget(widget.id);
      broadcastWidget(widget);
      return service.widgets.getById(widget.id);
    },

    getTodosForEvent: (event) => {
      const widget = contentWidgetForEvent(event, 'todo');
      return widget ? presentTodos(service.todos.listByWidget(widget.id)) : undefined;
    },

    createTodo: (event, document) => {
      const widget = contentWidgetForEvent(event, 'todo');
      if (!widget || (!document.text.trim() && document.images.length === 0)) return undefined;
      const todo = service.transaction(({ todos, todoImages }) => {
        const item = todos.create({ widgetId: widget.id, text: document.text });
        saveDocumentImages(todoImages, item.id, document.images);
        return item;
      });
      return presentTodos([todo])[0];
    },

    updateTodo: (event, todoId, patch) => {
      if (!todoForEvent(event, todoId)) {
        return undefined;
      }
      const { images, ...fields } = patch;
      if (fields.text !== undefined && !fields.text.trim() && !images?.length) return undefined;
      const updated = service.transaction(({ todos, todoImages }) => {
        if (fields.text !== undefined) saveDocumentImages(todoImages, todoId, images ?? []);
        return todos.update(todoId, fields);
      });
      return updated ? presentTodos([updated])[0] : undefined;
    },

    deleteTodo: (event, todoId) => {
      const widgetId = widgetIdForEvent(event);
      const todo = todoForEvent(event, todoId);
      if (!widgetId || !todo) {
        return undefined;
      }
      if (contentTrash) {
        clearTimeout(contentTrash.timer);
      }
      const images = service.todoImages.list(todo.id);
      if (!service.todos.delete(todoId)) {
        return undefined;
      }
      const timer = setTimeout(() => {
        if (contentTrash?.kind === 'todo' && contentTrash.item.id === todo.id) {
          contentTrash = undefined;
        }
      }, 5_000);
      contentTrash = { kind: 'todo', widgetId, item: todo, images, timer };
      return { ...todo, images: images.map(presentDocumentImage) };
    },

    restoreTodo: (event) => {
      const widgetId = widgetIdForEvent(event);
      if (
        !widgetId ||
        !contentTrash ||
        contentTrash.kind !== 'todo' ||
        contentTrash.widgetId !== widgetId
      ) {
        return undefined;
      }
      const { item: todo, images, timer } = contentTrash;
      clearTimeout(timer);
      contentTrash = undefined;
      service.transaction(({ todos, todoImages }) => {
        todos.create(todo);
        images.forEach((image) => todoImages.create(image));
      });
      return { ...todo, images: images.map(presentDocumentImage) };
    },

    reorderTodos: (event, orderedIds) => {
      const widgetId = widgetIdForEvent(event);
      if (!widgetId) {
        return undefined;
      }
      return presentTodos(service.todos.reorder(widgetId, orderedIds));
    },

    getClipsForEvent: (event) => {
      const widget = contentWidgetForEvent(event, 'clip');
      return widget ? presentClips(service.clipItems.listByWidget(widget.id)) : undefined;
    },

    createClip: (event, document) => {
      const widget = contentWidgetForEvent(event, 'clip');
      if (!widget || (!document.text.trim() && !document.images.length)) return undefined;
      const id = randomUUID();
      const { fields, images } = prepareClip(document, id);
      return service.transaction(({ clipItems, clipImages }) => {
        const clip = clipItems.create({ ...fields, id, widgetId: widget.id });
        if (clip.id !== id) return presentClip(clip, clipImages.list(clip.id));
        images.forEach((image) => clipImages.create(image));
        return presentClip(clip, images);
      });
    },

    updateClip: (event, clipId, document) => {
      const clip = clipForEvent(event, clipId);
      if (!clip || (!document.text.trim() && !document.images.length)) return undefined;
      const { fields, images } = prepareClip(document, clipId, service.clipImages.list(clipId));
      return service.transaction(({ clipItems, clipImages }) => {
        const updated = clipItems.update(clipId, fields);
        if (!updated) return undefined;
        saveDocumentImages(clipImages, clipId, document.images, images);
        return presentClip(updated, images);
      });
    },

    deleteClip: (event, clipId) => {
      const widgetId = widgetIdForEvent(event);
      const clip = clipForEvent(event, clipId);
      const images = clip?.kind === 'image' ? service.clipImages.list(clip.id) : [];
      if (!widgetId || !clip || !service.clipItems.delete(clipId)) {
        return undefined;
      }
      if (contentTrash) {
        clearTimeout(contentTrash.timer);
      }
      const timer = setTimeout(() => {
        if (contentTrash?.kind === 'clip' && contentTrash.item.id === clip.id) {
          contentTrash = undefined;
        }
      }, 5_000);
      contentTrash = { kind: 'clip', widgetId, item: clip, images, timer };
      return presentClip(clip, images);
    },

    restoreClip: (event) => {
      const widgetId = widgetIdForEvent(event);
      if (
        !widgetId ||
        !contentTrash ||
        contentTrash.kind !== 'clip' ||
        contentTrash.widgetId !== widgetId
      ) {
        return undefined;
      }
      const { item: clip, images, timer } = contentTrash;
      clearTimeout(timer);
      contentTrash = undefined;
      return service.transaction(({ clipItems, clipImages }) => {
        const restored = clipItems.create(clip);
        if (restored.id !== clip.id) return presentClip(restored, clipImages.list(restored.id));
        images.forEach((image) => clipImages.create(image));
        return presentClip(restored, images);
      });
    },

    reorderClips: (event, orderedIds) => {
      const widgetId = widgetIdForEvent(event);
      if (!widgetId) {
        return undefined;
      }
      return presentClips(service.clipItems.reorder(widgetId, orderedIds));
    },

    copyClip: async (event, clipId) => {
      const clip = clipForEvent(event, clipId);
      if (!clip) {
        return undefined;
      }
      if (clip.kind === 'text') {
        await clipboard.writeText(clip.text);
        return presentClip(clip);
      }
      const images = service.clipImages.list(clip.id);
      if (!images.length || clip.documentText === null) return undefined;
      if (images.length === 1 && !clip.documentText.trim()) {
        const [image] = images;
        const png = image.mime === 'image/png' ? image.data : nativeImage.createFromBuffer(image.data).toPNG();
        await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]);
      } else {
        const { plain, html } = clipboardDocument(clip.documentText, images);
        await clipboard.write([new ClipboardItem({ 'text/plain': plain, 'text/html': html })]);
      }
      return presentClip(clip, images);
    },

    getNote: (event) => {
      const widget = contentWidgetForEvent(event, 'note');
      if (!widget) return undefined;
      return {
        text: widget.noteText,
        images: service.noteImages.list(widget.id).map(presentDocumentImage),
      };
    },

    saveNote: (event, note) => {
      const widget = contentWidgetForEvent(event, 'note');
      if (!widget) return false;

      service.transaction(({ widgets, noteImages }) => {
        saveDocumentImages(noteImages, widget.id, note.images);
        if (widget.noteText !== note.text) widgets.update(widget.id, { noteText: note.text });
      });
      return true;
    },

    setActiveTab: (event, activeTab) => {
      const widgetId = widgetIdForEvent(event);
      if (!widgetId) {
        return undefined;
      }
      const widget = service.widgets.getById(widgetId);
      if (!widget || widget.type !== 'desk') {
        return undefined;
      }
      return service.widgets.update(widgetId, { activeTab });
    },
  };
}
