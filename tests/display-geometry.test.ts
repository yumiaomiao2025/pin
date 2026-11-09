import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayForWidget, fitWidgetBounds, type SavedGeometry } from '../src/main/windows/geometry';

test('restore prefers the saved display and keeps saved dimensions across different screen sizes', () => {
  const primary = { id: 1, workArea: { x: 0, y: 0, width: 1024, height: 700 } };
  const secondary = { id: 2, workArea: { x: -2560, y: 0, width: 2560, height: 1400 } };
  const saved: SavedGeometry & { displayId: number } = { type: 'note', displayId: 2, collapsed: false, collapsedWidth: null,
    x: -1000, y: 40, width: 320, height: 240 };

  const connected = displayForWidget(saved.displayId, [primary, secondary], primary);
  assert.deepEqual(fitWidgetBounds(saved, connected.workArea), { x: -1000, y: 40, width: 320, height: 240 });

  const disconnected = displayForWidget(saved.displayId, [primary], primary);
  assert.deepEqual(fitWidgetBounds(saved, disconnected.workArea), { x: 0, y: 40, width: 320, height: 240 });
  assert.equal(displayForWidget(saved.displayId, [primary, secondary], primary), secondary);
});

test('a temporarily smaller display clips only the restored bounds', () => {
  const saved: SavedGeometry = { type: 'todo', collapsed: false, collapsedWidth: null,
    x: 50, y: 50, width: 1000, height: 900 };
  const small = { x: 0, y: 0, width: 800, height: 600 };
  const large = { x: 0, y: 0, width: 1600, height: 1000 };
  assert.deepEqual(fitWidgetBounds(saved, small), { x: 0, y: 0, width: 800, height: 600 });
  assert.deepEqual(fitWidgetBounds(saved, large), { x: 50, y: 50, width: 1000, height: 900 });
});
