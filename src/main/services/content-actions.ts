import { clipboard, type IpcMainInvokeEvent } from 'electron';
import { type Todo, type ClipItem, type Widget } from '../database/schema';
import type { AppDatabaseService } from '../database/app-service';
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
  | 'reorderClips' | 'copyClip' | 'saveNote' | 'setActiveTab'
> & {
  deleteWidgetById(widgetId: string): Widget | undefined;
  clearUndo(): void;
};

export function createContentActions(service: AppDatabaseService, dependencies: ContentDependencies): ContentActions {
  const { cancelWidgetPersist, closeWidget, onWidgetDeleted, openWidget, broadcastWidget } = dependencies;
  let contentTrash:
    | { kind: 'todo'; widgetId: string; item: Todo; timer: ReturnType<typeof setTimeout> }
    | { kind: 'clip'; widgetId: string; item: ClipItem; timer: ReturnType<typeof setTimeout> }
    | { kind: 'widget'; item: Widget; todos: Todo[]; clips: ClipItem[]; timer: ReturnType<typeof setTimeout> }
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
    closeWidget(widgetId);
    service.widgets.delete(widgetId);
    onWidgetDeleted(widgetId);

    const timer = setTimeout(() => {
      if (contentTrash?.kind === 'widget' && contentTrash.item.id === widget.id) {
        contentTrash = undefined;
      }
    }, 5_000);
    contentTrash = { kind: 'widget', item: widget, todos, clips, timer };
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
      const { item: widget, todos, clips, timer } = contentTrash;
      clearTimeout(timer);
      contentTrash = undefined;
      service.transaction(({ widgets, todos: todoRepository, clipItems }) => {
        widgets.create(widget);
        todos.forEach((todo) => todoRepository.create(todo));
        clips.forEach((clip) => clipItems.create(clip));
      });
      openWidget(widget.id);
      broadcastWidget(widget);
      return service.widgets.getById(widget.id);
    },

    getTodosForEvent: (event) => {
      const widgetId = widgetIdForEvent(event);
      return widgetId ? service.todos.listByWidget(widgetId) : undefined;
    },

    createTodo: (event, text) => {
      const widgetId = widgetIdForEvent(event);
      return widgetId ? service.createTodo({ widgetId, text }) : undefined;
    },

    updateTodo: (event, todoId, patch) => {
      if (!todoForEvent(event, todoId)) {
        return undefined;
      }
      return service.todos.update(todoId, patch);
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
      if (!service.todos.delete(todoId)) {
        return undefined;
      }
      const timer = setTimeout(() => {
        if (contentTrash?.kind === 'todo' && contentTrash.item.id === todo.id) {
          contentTrash = undefined;
        }
      }, 5_000);
      contentTrash = { kind: 'todo', widgetId, item: todo, timer };
      return todo;
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
      const { item: todo, timer } = contentTrash;
      clearTimeout(timer);
      contentTrash = undefined;
      return service.createTodo({
        id: todo.id,
        widgetId: todo.widgetId,
        text: todo.text,
        done: todo.done,
        sortOrder: todo.sortOrder,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
      });
    },

    reorderTodos: (event, orderedIds) => {
      const widgetId = widgetIdForEvent(event);
      if (!widgetId) {
        return undefined;
      }
      return service.todos.reorder(widgetId, orderedIds);
    },

    getClipsForEvent: (event) => {
      const widgetId = widgetIdForEvent(event);
      return widgetId ? service.clipItems.listByWidget(widgetId) : undefined;
    },

    createClip: (event, text) => {
      const widgetId = widgetIdForEvent(event);
      return widgetId ? service.createClipItem({ widgetId, text }) : undefined;
    },

    updateClip: (event, clipId, patch) => {
      if (!clipForEvent(event, clipId)) {
        return undefined;
      }
      return service.clipItems.update(clipId, patch);
    },

    deleteClip: (event, clipId) => {
      const widgetId = widgetIdForEvent(event);
      const clip = clipForEvent(event, clipId);
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
      contentTrash = { kind: 'clip', widgetId, item: clip, timer };
      return clip;
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
      const { item: clip, timer } = contentTrash;
      clearTimeout(timer);
      contentTrash = undefined;
      return service.createClipItem({
        id: clip.id,
        widgetId: clip.widgetId,
        text: clip.text,
        sortOrder: clip.sortOrder,
        createdAt: clip.createdAt,
        updatedAt: clip.updatedAt,
      });
    },

    reorderClips: (event, orderedIds) => {
      const widgetId = widgetIdForEvent(event);
      if (!widgetId) {
        return undefined;
      }
      return service.clipItems.reorder(widgetId, orderedIds);
    },

    copyClip: (event, clipId) => {
      const clip = clipForEvent(event, clipId);
      if (!clip) {
        return undefined;
      }
      clipboard.writeText(clip.text);
      return clip;
    },

    saveNote: (event, noteText) => {
      const widgetId = widgetIdForEvent(event);
      if (!widgetId) {
        return undefined;
      }
      return service.widgets.update(widgetId, { noteText });
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
