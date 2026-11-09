const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function verifyWorkflow({ evaluate, waitFor, page, connect, note, colors, profile }) {
  const waitIn = (rpc, expression) => waitFor(() => evaluate(rpc, expression)).catch(error => {
    throw new Error(`Condition failed: ${expression}`, {cause:error});
  });
  const click = async (rpc, selector) => {
    await waitIn(rpc, `!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);
    await evaluate(rpc, `document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const input = async (rpc, selector, value) => {
    await waitIn(rpc, `!!document.querySelector(${JSON.stringify(selector)})`);
    await evaluate(rpc, `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event('input', {bubbles:true}));
    })()`);
  };
  const enter = (rpc, selector) => evaluate(rpc, `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',code:'Enter',bubbles:true}))`);
  const assertPlainFrame = async (rpc, selector) => {
    await waitIn(rpc, `!!document.querySelector(${JSON.stringify(selector)})`);
    assert.ok(await evaluate(rpc, `(() => {
      const frame = document.querySelector(${JSON.stringify(selector)});
      const {right, bottom} = frame.getBoundingClientRect();
      return getComputedStyle(frame).boxShadow === 'none'
        && Math.abs(right - (innerWidth - 2)) <= 1 && Math.abs(bottom - (innerHeight - 2)) <= 1;
    })()`), `${selector} must fill the drawable area without a shadow gutter`);
  };
  const assertPaintedFrame = async (rpc) => {
    const screenshot = await rpc('Page.captureScreenshot', {format:'png'});
    const edges = await evaluate(rpc, `(async () => {
      const blob = await (await fetch('data:image/png;base64,${screenshot.data}')).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d', {willReadFrequently:true});
      context.drawImage(bitmap, 0, 0);
      const w = bitmap.width;
      const h = bitmap.height;
      const x = Math.floor(w * 0.35);
      const y = Math.floor(h * 0.6);
      const expected = getComputedStyle(document.querySelector('.app')).borderRightColor.match(/\\d+/g).slice(0,3).map(Number);
      const hasBorder = (pixels) => {
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i+3] === 255 && expected.every((value, channel) => value === pixels[i+channel])) return true;
        }
        return false;
      };
      return {
        top: hasBorder(context.getImageData(x, 0, 1, 3).data),
        left: hasBorder(context.getImageData(0, y, 3, 1).data),
        // The native window may clip the outermost pixels at fractional DPI.
        right: hasBorder(context.getImageData(w-6, y, 4, 1).data),
        bottom: hasBorder(context.getImageData(x, h-6, 1, 4).data),
      };
    })()`);
    assert.deepEqual(edges, {top:true,left:true,right:true,bottom:true}, 'All four frame edges must be visible in the rendered window');
  };
  const noteId = await evaluate(note, '(await window.pinApi.getWidget()).id');
  const managerTarget = (await page('manager')).id;
  await assertPlainFrame(note, '.app');
  await assertPlainFrame(colors, '.colors-app');
  const moved = await evaluate(note, `(async () => {
    const api = window.pinApi;
    const initial = await api.getWindowBounds();
    const initialSaved = await api.getWidget();
    const initialViewport = [innerWidth, innerHeight];
    const steps = [];
    for (let i = 1; i <= 16; i++) {
      const position = { x: initial.x + (i % 8) + 24, y: initial.y + (i % 7) + 24 };
      await api.setPosition(position.x, position.y);
      steps.push({ bounds: await api.getWindowBounds(), viewport: [innerWidth, innerHeight] });
    }
    return { initial, initialSaved, initialViewport, steps, persisted: await api.getWidget(), scale: devicePixelRatio };
  })()`);
  const size = ({ width, height }) => [width, height];
  assert.notEqual(moved.steps.at(-1).bounds.x, moved.initial.x, 'Move must change the window position');
  for (const [index, { bounds, viewport }] of moved.steps.entries()) {
    const message = `Move ${index + 1} must preserve size at scale ${moved.scale}`;
    assert.deepEqual(viewport, moved.initialViewport, message);
    // Electron encloses the physical bounds in whole logical pixels. At 125%,
    // changing the origin can round an unchanged physical size up by one DIP.
    assert.ok(size(bounds).every((dimension, axis) => Math.abs(dimension - size(moved.initial)[axis]) <= 1), message);
  }
  assert.deepEqual(size(moved.persisted), size(moved.initialSaved), 'Move must preserve the saved size');
  const resized = await evaluate(note, `(async () => {
    const api = window.pinApi;
    const before = await api.getWindowBounds();
    await api.setSize(before.width + 32, before.height + 32);
    return api.getWindowBounds();
  })()`);
  assert.ok(resized.width > moved.initial.width && resized.height > moved.initial.height, 'Explicit resize still works');
  await note('Page.bringToFront');
  await evaluate(note, `(async () => {
    await window.pinApi.setPosition(427, 436);
    await window.pinApi.setSize(262, 232);
  })()`);
  await waitIn(note, 'Math.abs(innerWidth - 262) <= 2 && Math.abs(innerHeight - 232) <= 2');
  const readWidth = `({frame:document.querySelector('.app').getBoundingClientRect().width, saved:(await window.pinApi.getWidget()).width})`;
  const originalWidth = await evaluate(note, readWidth);
  const foldWidths = [];
  for (let cycle = 0; cycle < 5; cycle++) {
    await click(note, '[aria-label="折叠"]');
    await waitIn(note, "innerHeight < 50 && !!document.querySelector('[aria-label=展开]')").catch(async error => {
      console.error(await evaluate(note, `({frame:[innerWidth,innerHeight],bounds:await window.pinApi.getWindowBounds(),collapsed:(await window.pinApi.getWidget()).collapsed,button:!!document.querySelector('[aria-label=展开]')})`));
      throw error;
    });
    foldWidths.push(await evaluate(note, readWidth));
    await click(note, '[aria-label="展开"]');
    await waitIn(note, "innerHeight > 160 && !!document.querySelector('[aria-label=折叠]')");
    // The old resize listener rewrites the saved width 100 ms after expanding.
    await new Promise(resolve => setTimeout(resolve, 130));
    foldWidths.push(await evaluate(note, readWidth));
  }
  assert.deepEqual(foldWidths, Array.from({length:10}, () => originalWidth), 'Repeated folding must preserve visible and saved widths');
  assert.deepEqual(await evaluate(colors, "Array.from(document.querySelectorAll('.color-preset-name'), e => e.textContent)"), ['经典黄', '牛皮纸', '蓝图', '草绿']);
  await click(colors, '.color-custom-placeholder');
  await input(colors, 'input[aria-label="背景色"]', '#bbddcc');
  await input(colors, 'input[aria-label="强调色"]', '#77aabb');
  await input(colors, 'input[aria-label="文字色"]', '#223344');
  await waitIn(note, "getComputedStyle(document.querySelector('.titlebar')).backgroundColor === 'rgb(119, 170, 187)'");
  await input(colors, '#color-kit-name', '回归配色');
  await click(colors, '.color-kit-save');
  await waitIn(colors, "document.querySelector('.type-label').textContent === 'COLORS · 回归配色'");
  const saved = await evaluate(colors, '(await window.pinApi.listColorKits())[0]');
  assert.equal(saved.title, saved.accent);
  assert.equal(saved.shadow, saved.ink);
  assert.equal(saved.spine, null);
  assert.equal(await evaluate(note, '(await window.pinApi.getWidget()).colorKitId'), saved.id);
  assert.equal(await evaluate(note, 'window.pinApi.getColorPreview()'), null);
  await click(colors, '[aria-label="编辑 回归配色"]');
  await input(colors, 'input[aria-label="强调色"]', '#aabbcc');
  await waitIn(note, "getComputedStyle(document.querySelector('.titlebar')).backgroundColor === 'rgb(170, 187, 204)'");
  await click(colors, '.colors-titlebar button');
  await waitIn(note, "getComputedStyle(document.querySelector('.titlebar')).backgroundColor === 'rgb(119, 170, 187)'");
  await click(colors, '[aria-label="删除 回归配色"]');
  await waitIn(colors, "!!document.querySelector('.color-kit-confirm:modal')");
  assert.equal(await evaluate(colors, "getComputedStyle(document.querySelector('.color-kit-confirm')).backgroundColor"), 'rgb(187, 221, 204)');
  assert.equal(await evaluate(colors, "getComputedStyle(document.querySelector('.color-kit-confirm')).boxShadow"), 'none');
  await colors('Emulation.setDeviceMetricsOverride', {width:240,height:400,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate(colors, "(() => {const e=document.querySelector('.color-kit-confirm');const r=e.getBoundingClientRect();return r.x >= 0 && r.right <= innerWidth && e.scrollWidth <= e.clientWidth;})()"), true);
  const screenshot = await colors('Page.captureScreenshot');
  fs.writeFileSync(path.join(profile, 'delete-dialog-240.png'), Buffer.from(screenshot.data, 'base64'));
  await click(colors, '.color-kit-confirm button');
  await waitIn(colors, "!document.querySelector('.color-kit-confirm')");
  assert.equal((await evaluate(colors, 'window.pinApi.listColorKits()')).length, 1);
  await colors('Emulation.clearDeviceMetricsOverride');
  await evaluate(note, 'window.pinApi.openManager()');
  await waitIn(colors, "document.querySelectorAll('.manager-row').length === 1");
  await assertPlainFrame(colors, '.manager-app');
  assert.equal((await page('manager')).id, managerTarget);
  const created = {};
  for (const type of ['todo', 'clip', 'desk']) created[type] = await evaluate(colors, `window.pinApi.createManagedWidget('${type}')`);
  const todo = await connect((await page('widget', created.todo.id)).webSocketDebuggerUrl);
  const clip = await connect((await page('widget', created.clip.id)).webSocketDebuggerUrl);
  const desk = await connect((await page('widget', created.desk.id)).webSocketDebuggerUrl);
  await waitIn(todo, "document.querySelector('.type-label')?.textContent === 'TODO'");
  await assertPlainFrame(todo, '.app.widget-themed');
  await evaluate(todo, 'window.pinApi.setSize(350, 350)');
  await waitIn(todo, 'Math.abs(innerWidth - 350) <= 2 && Math.abs(innerHeight - 350) <= 2');
  await assertPaintedFrame(todo);
  await assertPlainFrame(clip, '.app.widget-themed');
  await assertPlainFrame(desk, '.app.widget-themed');
  await evaluate(todo, `(async () => {
    const bounds = await window.pinApi.getWindowBounds();
    await window.pinApi.setPosition(bounds.x + 17, bounds.y + 9);
  })()`);
  const expanded = await evaluate(todo, 'window.pinApi.getWidget()');
  const readFrame = `(() => {
    const app = document.querySelector('.app');
    const titlebar = document.querySelector('.titlebar');
    const frame = app.getBoundingClientRect();
    const title = titlebar.getBoundingClientRect();
    return {
      width: frame.width,
      height: frame.height,
      position: [screenX, screenY],
      titleHeight: title.bottom - frame.top,
      titleOffset: titlebar.querySelector('.type-label').getBoundingClientRect().left - frame.left,
      actions: [...titlebar.querySelectorAll('button')].map(button => button.getBoundingClientRect().left - frame.left),
      roomBelow: innerHeight - frame.bottom,
      bottomBorder: parseFloat(getComputedStyle(titlebar).borderBottomWidth),
      shadow: getComputedStyle(app).boxShadow,
    };
  })()`;
  const expandedFrame = await evaluate(todo, readFrame);
  await click(todo, '[aria-label="折叠"]');
  await waitIn(todo, "!!document.querySelector('[aria-label=展开]')");
  const collapsedFrame = await evaluate(todo, readFrame);
  assert.ok(Math.abs(collapsedFrame.width - expandedFrame.width) <= 1, `Visible width changed from ${expandedFrame.width} to ${collapsedFrame.width}`);
  assert.deepEqual(collapsedFrame.position, expandedFrame.position);
  assert.equal(collapsedFrame.titleOffset, expandedFrame.titleOffset);
  assert.deepEqual(collapsedFrame.actions, expandedFrame.actions);
  assert.ok(Math.abs(collapsedFrame.height - expandedFrame.titleHeight) < 0.1, 'Collapsed frame must match the expanded title bar height');
  assert.ok(collapsedFrame.bottomBorder > 0 && collapsedFrame.roomBelow >= 2, 'The bottom border must be inside the native window');
  assert.equal(collapsedFrame.shadow, 'none');
  await waitIn(todo, "!!document.querySelector('[aria-label=调整窗口宽度]')");
  await todo('Page.bringToFront');
  const gripPoint = await evaluate(todo, `(() => {
    const rect = document.querySelector('[aria-label=调整窗口宽度]').getBoundingClientRect();
    return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
  })()`);
  await todo('Input.dispatchMouseEvent', {type:'mousePressed', ...gripPoint, button:'left', buttons:1, clickCount:1});
  await todo('Input.dispatchMouseEvent', {type:'mouseMoved', x:gripPoint.x - 2, y:gripPoint.y, button:'left', buttons:1});
  await todo('Input.dispatchMouseEvent', {type:'mouseMoved', x:gripPoint.x - 48, y:gripPoint.y, button:'left', buttons:1});
  await todo('Input.dispatchMouseEvent', {type:'mouseReleased', x:gripPoint.x - 48, y:gripPoint.y, button:'left', clickCount:1});
  await waitIn(todo, `window.pinApi.getWidget().then(widget => Math.abs(widget.collapsedWidth - (${expanded.width} - 48)) < 8)`);
  const compact = await evaluate(todo, `(async () => {
    const before = await window.pinApi.getWindowBounds();
    const saved = await window.pinApi.setSize(1, 900);
    const after = await window.pinApi.getWindowBounds();
    return { before, after, saved };
  })()`);
  assert.equal(compact.saved.collapsedWidth, 120);
  assert.deepEqual(size(compact.saved), size(expanded));
  assert.ok(Math.abs(compact.after.height - 38) <= 2, `Expected a compact title-bar window, got ${compact.after.height} DIP`);
  assert.ok(Math.abs(compact.before.height - compact.after.height) <= 1);
  await waitIn(todo, `(() => {
    const bar = document.querySelector('.titlebar').getBoundingClientRect();
    const grip = document.querySelector('[aria-label=调整窗口宽度]').getBoundingClientRect();
    const buttons = [...document.querySelectorAll('.titlebar button')];
    return innerWidth < 130 && buttons.length === 3 && buttons.every(button => {
      const {left, right, width} = button.getBoundingClientRect();
      return width >= 18 && left >= bar.left && right <= grip.left;
    });
  })()`);
  await evaluate(note, 'window.pinApi.openManager()');
  await waitIn(colors, "document.querySelectorAll('.manager-row').length === 4");
  const editTitle = async () => {
    await todo('Page.bringToFront');
    const point = await evaluate(todo, `(() => {
      const rect = document.querySelector('.titlebar .type-label').getBoundingClientRect();
      return {x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
    })()`);
    for (const clickCount of [1, 2]) {
      await todo('Input.dispatchMouseEvent', {type:'mousePressed', ...point, button:'left', clickCount});
      await todo('Input.dispatchMouseEvent', {type:'mouseReleased', ...point, button:'left', clickCount});
    }
  };
  await editTitle();
  await input(todo, '[aria-label="窗口名称"]', '旅行待办');
  await enter(todo, '[aria-label="窗口名称"]');
  await waitIn(todo, "document.querySelector('.type-label')?.textContent === '旅行待办'");
  await waitIn(colors, "[...document.querySelectorAll('.manager-row')].some(row => row.textContent.includes('旅行待办'))");
  await editTitle();
  await input(todo, '[aria-label="窗口名称"]', '不保存');
  await evaluate(todo, "document.querySelector('[aria-label=窗口名称]').dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}))");
  await waitIn(todo, "document.querySelector('.type-label')?.textContent === '旅行待办'");
  await todo('Page.reload');
  await waitIn(todo, "document.querySelector('.type-label')?.textContent === '旅行待办' && !!document.querySelector('[aria-label=展开]')");
  const collapsedImage = await todo('Page.captureScreenshot');
  fs.writeFileSync(path.join(profile, 'collapsed-todo.png'), Buffer.from(collapsedImage.data, 'base64'));
  await click(todo, '[aria-label="展开"]');
  await waitIn(todo, `Math.abs(innerWidth - ${expanded.width}) <= 2 && !!document.querySelector('.todo-input')`);
  await assertPlainFrame(todo, '.app.widget-themed');
  assert.ok(Math.abs((await evaluate(todo, '(await window.pinApi.getWindowBounds()).height')) - expanded.height) <= 2);
  await click(todo, '[aria-label="折叠"]');
  await waitIn(todo, `Math.abs(innerWidth - ${expanded.width}) <= 2 && !!document.querySelector('[aria-label=展开]')`);
  assert.deepEqual((await evaluate(todo, readFrame)).actions, expandedFrame.actions);
  await click(todo, '[aria-label="展开"]');
  await input(todo, '.todo-input', '待办回归');
  await enter(todo, '.todo-input');
  await waitIn(todo, "document.querySelector('.todo-text')?.textContent === '待办回归'");
  await click(todo, '[aria-label="标记完成"]');
  await waitIn(todo, "!!document.querySelector('.todo-row--done')");
  await click(todo, '[aria-label="删除待办"]');
  await waitIn(todo, "!!document.querySelector('.todo-undo-button')");
  await click(todo, '.todo-undo-button');
  await waitIn(todo, "!!document.querySelector('.todo-row--done')");
  assert.equal((await evaluate(todo, 'window.pinApi.listTodos()'))[0].done, true);
  await input(clip, '.clip-input', '剪贴回归');
  await enter(clip, '.clip-input');
  await waitIn(clip, "!!document.querySelector('.clip-row')");
  await input(clip, '.clip-input', '剪贴回归');
  await enter(clip, '.clip-input');
  await waitIn(clip, "document.querySelector('.clip-input').value === ''");
  assert.equal((await evaluate(clip, 'window.pinApi.listClips()')).length, 1);
  await click(clip, '[aria-label="复制剪贴文本"]');
  await waitIn(clip, "!!document.querySelector('[aria-label=已复制]')");
  await click(clip, '[aria-label="删除剪贴文本"]');
  await click(clip, '.clip-undo-button');
  await waitIn(clip, "document.querySelectorAll('.clip-row').length === 1");
  await waitIn(desk, "!!document.querySelector('.desk-tabs')");
  await input(desk, '.note-editor', 'DESK 独立正文');
  await waitIn(desk, "window.pinApi.getWidget().then(widget => widget.noteText === 'DESK 独立正文')");
  await click(desk, '.desk-tab:nth-child(2)');
  await waitIn(desk, "!!document.querySelector('.todo-input')");
  await input(desk, '.todo-input', 'DESK 待办');
  await enter(desk, '.todo-input');
  await waitIn(desk, "document.querySelector('.todo-text')?.textContent === 'DESK 待办'");
  assert.equal((await evaluate(todo, 'window.pinApi.listTodos()')).length, 1);
  await evaluate(note, 'window.pinApi.openSettings()');
  await waitIn(colors, "!!document.querySelector('.settings-titlebar')");
  await assertPlainFrame(colors, '.settings-app');
  await evaluate(colors, 'window.pinApi.updateSettings({fontSize:14,maxLines:2,defaultOpacity:5})');
  await waitIn(note, "getComputedStyle(document.documentElement).fontSize === '14px'");
  await evaluate(note, 'window.pinApi.openWidgetColors()');
  await waitIn(colors, "!!document.querySelector('.color-custom-placeholder:not(:disabled)')");
  await click(colors, '.color-custom-placeholder');
  await input(colors, 'input[aria-label="背景色"]', '#aabbcc');
  await waitIn(note, "getComputedStyle(document.querySelector('.app')).backgroundColor === 'rgb(170, 187, 204)'");
  assert.equal(await evaluate(todo, "getComputedStyle(document.querySelector('.app')).backgroundColor"), 'rgb(187, 221, 204)');
  await input(colors, '#color-kit-name', '独立配色');
  await click(colors, '.color-kit-save');
  await waitIn(colors, "document.querySelector('.type-label').textContent === 'COLORS · 独立配色'");
  assert.equal(await evaluate(note, '(await window.pinApi.getWidget()).followsDefault'), false);
  await evaluate(note, 'window.pinApi.openDefaultColors()');
  await waitIn(colors, "!!document.querySelector('.color-custom-placeholder:not(:disabled)')");
  await click(colors, '.color-custom-placeholder');
  await input(colors, 'input[aria-label="背景色"]', '#eeddbb');
  await waitIn(todo, "getComputedStyle(document.querySelector('.app')).backgroundColor === 'rgb(238, 221, 187)'");
  assert.equal(await evaluate(note, "getComputedStyle(document.querySelector('.app')).backgroundColor"), 'rgb(170, 187, 204)');
  await click(colors, '.colors-titlebar button');
  await waitIn(todo, "getComputedStyle(document.querySelector('.app')).backgroundColor === 'rgb(187, 221, 204)'");
  await evaluate(note, 'window.pinApi.openManager()');
  await waitIn(colors, "document.querySelectorAll('.manager-row').length === 4");
  assert.equal((await evaluate(colors, 'window.pinApi.listManagedWidgets()')).find(widget => widget.id === noteId).noteText, 'packaged cleanup check');
  await evaluate(note, 'window.pinApi.setOpacity(5)');
  await click(note, '[aria-label="折叠"]');
  await waitIn(note, "!document.querySelector('.note-editor')");
  await click(note, '[aria-label="展开"]');
  await waitIn(note, "!!document.querySelector('.note-editor')");
  assert.equal(await evaluate(note, '(await window.pinApi.getWidget()).opacity'), 5);
  await require('./packaged-lifecycle.cjs')({ evaluate, waitIn, page, connect, input, note, todo, manager: colors });
  console.log('PASS: shared utility navigation; named kits and theme dialogs; preview scope isolation; TODO and CLIP workflows; DESK isolation; settings and window controls');
};
