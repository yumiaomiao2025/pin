import type { AppDatabase } from './database';
import {
  createRepositories,
  type AppRepositories,
  type CreateClipItemInput,
  type CreateTodoInput,
  type RepositoryOptions,
} from './repositories';
import type { ClipItem, Todo, Widget } from './schema';

export interface AppDatabaseService extends AppRepositories {
  createTodo(input: CreateTodoInput): Todo;
  createClipItem(input: CreateClipItemInput): ClipItem;
  transaction<T>(work: (repositories: AppRepositories) => T): T;
}

function requireWidget(repositories: AppRepositories, widgetId: string): Widget {
  const widget = repositories.widgets.getById(widgetId);
  if (!widget) {
    throw new Error(`Widget ${widgetId} does not exist`);
  }
  return widget;
}

function assertContentWidget(widget: Widget, content: 'todo' | 'clip') {
  const allowedTypes = content === 'todo' ? ['todo', 'desk'] : ['clip', 'desk'];
  if (!allowedTypes.includes(widget.type)) {
    throw new Error(`${content} items can only belong to ${content} or desk widgets`);
  }
}

export function createAppDatabaseService(
  db: AppDatabase,
  options: RepositoryOptions = {},
): AppDatabaseService {
  const repositories = createRepositories(db, options);

  return {
    ...repositories,
    createTodo: (input) => {
      assertContentWidget(requireWidget(repositories, input.widgetId), 'todo');
      return repositories.todos.create(input);
    },
    createClipItem: (input) => {
      assertContentWidget(requireWidget(repositories, input.widgetId), 'clip');
      return repositories.clipItems.create(input);
    },
    transaction: (work) => db.transaction((tx) => work(createRepositories(tx, options))),
  };
}
