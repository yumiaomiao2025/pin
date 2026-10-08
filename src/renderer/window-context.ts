

export function getWindowContext() {
  const params = new URLSearchParams(window.location.search);
  return {
    role: params.get('role') ?? 'unknown',
    page: params.get('page') ?? 'manager',
    id: params.get('id') ?? 'unknown',
    scope: params.get('scope') ?? 'default',
    renameId: params.get('renameId'),
    widgetId: params.get('widgetId'),
  };
}
