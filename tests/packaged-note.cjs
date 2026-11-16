const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const insertExample = (evaluate, widget, selector = '.note-editor', includeText = true, drop = false) => evaluate(widget, `(async () => {
  const editor = document.querySelector(${JSON.stringify(selector)});
  editor.focus();
  const intro = '步骤 ';
  if (${includeText}) {
    editor.textContent = intro + ' 继续检查';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    window.getSelection().collapse(editor.firstChild, intro.length);
  }

  const canvas = new OffscreenCanvas(620, 264);
  const context = canvas.getContext('2d');
  context.fillStyle = '#20242c';
  context.fillRect(0, 0, 620, 264);
  context.fillStyle = '#303642';
  context.fillRect(0, 0, 620, 54);
  for (const [index, color] of ['#f18c82', '#fbd57d', '#94d3a2'].entries()) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(22 + index * 19, 27, 5, 0, Math.PI * 2);
    context.fill();
  }
  context.font = '22px Consolas';
  context.fillStyle = '#c7ccd4';
  context.fillText('Pin  /  Export log', 105, 34);
  context.fillText('> pin export notes', 24, 106);
  context.fillStyle = '#f8bd85';
  context.fillText('Export stopped: no folder selected.', 24, 157);
  context.fillStyle = '#c7ccd4';
  context.fillText('Choose a folder and try again.', 24, 205);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const clipboardData = new DataTransfer();
  clipboardData.items.add(new File([blob], 'export.png', { type: 'image/png' }));
  if (${drop}) {
    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: clipboardData });
    editor.dispatchEvent(dragOver);
    if (!dragOver.defaultPrevented) throw new Error('Image drag target did not accept the file');
    editor.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: clipboardData }));
  } else {
    editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  }
})()`);

const hasExample = `(() => {
  const editor = document.querySelector('.note-editor');
  const image = editor?.querySelector('.inline-editor-image');
  if (editor?.textContent.replaceAll('\\u00a0', ' ') !== '步骤  继续检查' || image?.naturalWidth !== 620) return false;
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight);
  const { width, height } = image.getBoundingClientRect();
  return height <= 2 * lineHeight + 0.5 && width <= editor.clientWidth
    && Math.abs((width - 2) / (height - 2) - image.naturalWidth / image.naturalHeight) < 0.1;
})()`;

async function capturePreview(widget, filename) {
  const screenshot = await widget('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(filename, Buffer.from(screenshot.data, 'base64'));
}

async function verifyNote({ evaluate, waitIn, note }) {
  assert.equal(await evaluate(note, "!!document.querySelector('.document-editor > .document-status, [aria-label=插入图片]')"), false);
  await insertExample(evaluate, note);
  await waitIn(note, hasExample);
  assert.equal(await evaluate(note, "!document.querySelector('.note-image-actions, [aria-label=替换图片], [aria-label=删除图片]')"), true);
  await note('Emulation.setFocusEmulationEnabled', { enabled: true });
  await note('Input.insertText', { text: '补充' });
  await waitIn(note, "window.pinApi.getNote().then(note => note?.text === '步骤 \\n补充 继续检查' && note.images.length === 1)");
  await evaluate(note, "document.execCommand('undo')");
  await waitIn(note, hasExample);
  await waitIn(note, "window.pinApi.getNote().then(note => note?.images.length === 1)");
  await note('Page.reload');
  await waitIn(note, hasExample);
  await evaluate(note, "document.querySelector('.inline-editor-image').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))");
  await waitIn(note, `(() => {
    const image = document.querySelector('.note-image-dialog[open] img');
    return image?.naturalWidth === 620 && image.offsetHeight > document.querySelector('.inline-editor-image').offsetHeight;
  })()`);
  await evaluate(note, "document.querySelector('.note-image-dialog button').click()");
  await waitIn(note, "!document.querySelector('.note-image-dialog[open]')");
  const screenshotPath = process.env.PIN_NOTE_PREVIEW_PATH;
  if (screenshotPath) await capturePreview(note, screenshotPath);

  await evaluate(note, `(() => {
    const editor = document.querySelector('.note-editor');
    editor.focus();
    const range = document.createRange();
    range.setStartAfter(editor.querySelector('.inline-editor-image'));
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  })()`);
  await note('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await note('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await waitIn(note, "window.pinApi.getNote().then(note => note?.images.length === 0 && note.text === '步骤  继续检查')");
  await evaluate(note, "document.execCommand('undo')");
  await waitIn(note, "window.pinApi.getNote().then(note => note?.images.length === 1)");
  await evaluate(note, `(() => {
    const editor = document.querySelector('.note-editor');
    editor.focus();
    window.getSelection().selectAllChildren(editor);
    document.execCommand('insertText', false, '第一行\\n\\n第三行\\n');
  })()`);
  await waitIn(note, "window.pinApi.getNote().then(note => note?.text === '第一行\\n\\n第三行\\n' && note.images.length === 0)");
  await evaluate(note, `(() => {
    const editor = document.querySelector('.note-editor');
    editor.replaceChildren();
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await insertExample(evaluate, note, '.note-editor', false);
  await waitIn(note, "!!document.querySelector('.note-editor .inline-editor-image')?.naturalWidth");
  await note('Input.insertText', { text: '右边' });
  await waitIn(note, "window.pinApi.getNote().then(note => note?.text === '\\n右边' && note.images.length === 1)");
  await verifyImageComposition({ evaluate, waitIn, note });
  console.log('PASS: inline note image paste, native typing and deletion, undo, preview and reload');
}

async function verifyImageComposition({ evaluate, waitIn, note }) {
  const initialText = '上面的内容\n图片在行尾';
  await evaluate(note, `(() => {
    const editor = document.querySelector('.note-editor');
    editor.replaceChildren(${JSON.stringify(initialText)});
    editor.focus();
    window.getSelection().collapse(editor.firstChild, editor.firstChild.length);
  })()`);
  await insertExample(evaluate, note, '.note-editor', false);
  const imageAtEnd = `window.pinApi.getNote().then(note => note?.text === ${JSON.stringify(initialText + '\n')} && note.images.length === 1)`;
  await waitIn(note, imageAtEnd);
  await note('Page.reload');
  await waitIn(note, "!!document.querySelector('.inline-editor-image')?.naturalWidth");
  const point = await evaluate(note, `(() => {
    const image = document.querySelector('.inline-editor-image').getBoundingClientRect();
    return { x: image.right + 12, y: image.bottom - 4 };
  })()`);
  await note('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await note('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  assert.equal(await evaluate(note, `(() => {
    const caret = window.getSelection().getRangeAt(0).getBoundingClientRect();
    const image = document.querySelector('.inline-editor-image').getBoundingClientRect();
    return caret.height > 0 && caret.left >= image.right && caret.top < image.bottom;
  })()`), true, 'A click beside a reopened image should give the IME a caret on that line');

  await note('Input.imeSetComposition', { text: 'fang', selectionStart: 4, selectionEnd: 4 });
  await waitIn(note, "document.querySelector('.note-editor').textContent.endsWith('fang')");
  assert.equal(await evaluate(note, imageAtEnd), true, 'Unconfirmed pinyin should stay out of storage');
  await note('Input.imeSetComposition', { text: 'fangjia', selectionStart: 7, selectionEnd: 7 });
  await note('Input.insertText', { text: '房价' });
  await waitIn(note, `window.pinApi.getNote().then(note => note?.text === ${JSON.stringify(initialText + '\n房价')})`);
  console.log('PASS: image-edge IME caret and committed Chinese text');
}

async function verifyTodoAndClip({ evaluate, waitIn, todo, clip }) {
  assert.equal(await evaluate(todo, "!!document.querySelector('.todo-input-row button')"), false);
  await insertExample(evaluate, todo, '.todo-input');
  await waitIn(todo, "!!document.querySelector('.todo-input .inline-editor-image')?.naturalWidth");
  await evaluate(todo, "document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}))");
  const todoHasImage = `(() => {
    const task = document.querySelector('.todo-document');
    const image = task?.querySelector('.content-image-thumbnail');
    const after = task?.lastChild;
    if (task?.textContent !== '步骤  继续检查' || image?.naturalWidth !== 620 || after?.nodeType !== Node.TEXT_NODE) return false;
    const range = document.createRange();
    range.setStart(after, 1);
    range.setEnd(after, 2);
    const rightText = range.getBoundingClientRect();
    const thumbnail = image.getBoundingClientRect();
    return thumbnail.height <= 2 * parseFloat(getComputedStyle(task).lineHeight) + 0.5
      && rightText.left >= thumbnail.right && rightText.top < thumbnail.bottom;
  })()`;
  await waitIn(todo, todoHasImage);
  await todo('Page.reload');
  await waitIn(todo, todoHasImage);
  await evaluate(todo, "document.querySelector('.todo-document').dispatchEvent(new MouseEvent('dblclick', {bubbles:true}))");
  await waitIn(todo, "!!document.querySelector('.todo-row .inline-editor-image')?.naturalWidth");
  await evaluate(todo, `(() => {
    const input = document.querySelector('.todo-row .inline-image-editor');
    input.firstChild.data = '补充 ';
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));
  })()`);
  await waitIn(todo, todoHasImage.replace('步骤 ', '补充 '));
  await evaluate(todo, "document.querySelector('.todo-document').closest('.todo-row').querySelector('[aria-label=删除待办]').click()");
  await waitIn(todo, "!!document.querySelector('.todo-undo-button') && !document.querySelector('.todo-document')");
  await evaluate(todo, "document.querySelector('.todo-undo-button').click()");
  await waitIn(todo, todoHasImage.replace('步骤 ', '补充 '));
  const screenshotPath = process.env.PIN_NOTE_PREVIEW_PATH;
  if (screenshotPath) {
    await evaluate(todo, "document.querySelector('.todo-document').scrollIntoView({block:'nearest'})");
    await capturePreview(todo, path.join(path.dirname(screenshotPath), 'pin-todo-thumbnail.png'));
  }

  assert.equal(await evaluate(clip, "!!document.querySelector('.clip-input-row button')"), false);
  await insertExample(evaluate, clip, '.clip-input', false, true);
  const saveClipDraft = async () => {
    await waitIn(clip, "!!document.querySelector('.clip-input .inline-editor-image')?.naturalWidth");
    await evaluate(clip, "document.querySelector('.clip-input').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}))");
    await waitIn(clip, "document.querySelector('.clip-input')?.textContent === ''");
  };
  await saveClipDraft();
  const clipHasImage = `(() => {
    const image = document.querySelector('.clip-document img');
    const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return image?.naturalWidth === 620 && image.getBoundingClientRect().height <= 2 * 1.384615 * fontSize + 0.5;
  })()`;
  await waitIn(clip, clipHasImage);
  await insertExample(evaluate, clip, '.clip-input', false);
  await saveClipDraft();
  assert.equal(await evaluate(clip, "document.querySelectorAll('.clip-document').length"), 1);
  await clip('Page.reload');
  await waitIn(clip, clipHasImage);
  await evaluate(clip, "document.querySelector('.clip-document').click()");
  await waitIn(clip, "!!document.querySelector('.clip-document').closest('.clip-row').querySelector('[aria-label=已复制]')");
  await clip('Browser.grantPermissions', { permissions: ['clipboardReadWrite'] });
  await clip('Emulation.setFocusEmulationEnabled', { enabled: true });
  assert.deepEqual(await evaluate(clip, `(async () => {
    const [item] = await navigator.clipboard.read();
    const image = await createImageBitmap(await item.getType('image/png'));
    return [image.width, image.height];
  })()`), [620, 264]);
  await evaluate(clip, "document.querySelector('[aria-label=删除剪贴图片]').click()");
  await waitIn(clip, "!!document.querySelector('.clip-undo-button') && !document.querySelector('.clip-document')");
  await evaluate(clip, "document.querySelector('.clip-undo-button').click()");
  await waitIn(clip, clipHasImage);
  await insertExample(evaluate, clip, '.clip-input');
  await waitIn(clip, "!!document.querySelector('.clip-input .inline-editor-image')?.naturalWidth");
  await clip('Input.insertText', { text: '<补充>' });
  await saveClipDraft();
  const mixedClip = `(() => {
    const content = Array.from(document.querySelectorAll('.clip-document')).find(node => node.textContent === '步骤 <补充> 继续检查');
    const image = content?.querySelector('img');
    if (!image?.naturalWidth) return false;
    const range = document.createRange();
    range.setStart(image.nextSibling, 0);
    range.setEnd(image.nextSibling, 1);
    const following = range.getBoundingClientRect();
    const thumbnail = image.getBoundingClientRect();
    return following.left >= thumbnail.right && following.top < thumbnail.bottom;
  })()`;
  await waitIn(clip, mixedClip);
  await clip('Page.reload');
  await waitIn(clip, mixedClip);
  await evaluate(clip, "Array.from(document.querySelectorAll('.clip-document')).find(node => node.textContent.includes('补充')).click()");
  await waitIn(clip, "!!Array.from(document.querySelectorAll('.clip-document')).find(node => node.textContent.includes('补充')).closest('.clip-row').querySelector('[aria-label=已复制]')");
  assert.deepEqual(await evaluate(clip, `(async () => {
    const [item] = await navigator.clipboard.read({ unsanitized: ['text/html'] });
    const plain = await (await item.getType('text/plain')).text();
    const html = await (await item.getType('text/html')).text();
    const template = document.createElement('template');
    template.innerHTML = html;
    const content = template.content.querySelector('[data-pin-clip]');
    return [plain, content.textContent, content.querySelector('img').getAttribute('src').startsWith('data:image/png;base64,')];
  })()`), ['步骤 <补充> 继续检查', '步骤 <补充> 继续检查', true]);
  await evaluate(clip, "document.querySelector('.clip-input').focus()");
  await clip('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 2 });
  await clip('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 2 });
  await waitIn(clip, "document.querySelector('.clip-input')?.textContent === '步骤 <补充> 继续检查' && !!document.querySelector('.clip-input img')?.naturalWidth");
  await saveClipDraft();
  assert.equal(await evaluate(clip, "document.querySelectorAll('.clip-document').length"), 2);
  await evaluate(clip, "Array.from(document.querySelectorAll('.clip-document')).find(node => node.textContent.includes('补充')).dispatchEvent(new MouseEvent('dblclick', {bubbles: true}))");
  await waitIn(clip, "!!document.querySelector('.clip-edit-field .inline-editor-image')?.naturalWidth");
  await evaluate(clip, `(() => {
    const editor = document.querySelector('.clip-edit-field .inline-image-editor');
    editor.firstChild.data = '已编辑 ';
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  })()`);
  await waitIn(clip, mixedClip.replace('步骤 ', '已编辑 '));
  if (screenshotPath) await capturePreview(clip, path.join(path.dirname(screenshotPath), 'pin-clip-thumbnail.png'));
  console.log('PASS: TODO and CLIP inline editing; image and rich clipboard round trips; deduplication, reload and undo');
}

module.exports = { verifyNote, verifyTodoAndClip, insertExample, hasExample };
