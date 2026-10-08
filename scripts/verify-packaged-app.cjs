const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-package-check-'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let processUnderTest;
let stderr = '';
const sockets = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(work) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const value = await work();
    if (value) return value;
    await sleep(50);
  }
  throw new Error(`Timeout; ${stderr}`);
}
async function connect(url) {
  const socket = new WebSocket(url);
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method} ${JSON.stringify(params)}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
(async () => {
  const executable = path.resolve(process.argv[2] ?? 'out/Pin-win32-x64/Pin.exe');
  assert.ok(fs.existsSync(executable), 'Build the package with pnpm package first');
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
  processUnderTest = spawn(executable, [
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--disable-gpu', '--enable-logging=stderr',
  ], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  processUnderTest.stderr.on('data', data => { stderr += data; });
  processUnderTest.stdout.on('data', data => { stderr += data; });
  processUnderTest.on('error', error => { stderr += error.stack; });
  processUnderTest.on('exit', (code, signal) => { stderr += `\nProcess exit: ${code}, signal: ${signal}`; });
  const endpoint = await waitFor(async () => {
    try { return (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; }
    catch { return undefined; }
  });
  const origin = endpoint.replace(/^ws:/, 'http:').split('/devtools/')[0];
  const page = async (role, widgetId) => waitFor(async () => {
    const list = await (await fetch(`${origin}/json/list`)).json();
    return list.find(target => target.type === 'page' && target.url.includes(`role=${role}`)
      && (!widgetId || new URL(target.url).searchParams.get('id') === widgetId));
  });
  const evaluate = async (rpc, expression) => {
    const result = await rpc('Runtime.evaluate', { expression: `(async () => { return (${expression}); })()`, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const onboarding = await connect((await page('onboarding')).webSocketDebuggerUrl);
  await waitFor(() => evaluate(onboarding, '!!window.pinApi'));
  assert.equal(await evaluate(onboarding, '(await window.pinApi.ping()).version'), require('../package.json').version);
  await evaluate(onboarding, "void window.pinApi.createWidget('note')");
  const note = await connect((await page('widget')).webSocketDebuggerUrl);
  await waitFor(() => evaluate(note, "!!document.querySelector('.titlebar')"));
  await evaluate(note, `(() => {
    const input = document.querySelector('.note-editor');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'packaged cleanup check');
    input.dispatchEvent(new Event('input', {bubbles:true}));
  })()`);
  await waitFor(() => evaluate(note, "window.pinApi.getWidget().then(widget => widget.noteText === 'packaged cleanup check')"));
  await evaluate(note, 'window.pinApi.openDefaultColors()');
  const colors = await connect((await page('manager')).webSocketDebuggerUrl);
  await waitFor(() => evaluate(colors, "!!document.querySelector('.color-custom-placeholder')"));
  const original = await evaluate(colors, 'window.pinApi.getSettings()');
  await evaluate(colors, "document.querySelector('.color-custom-placeholder').click()");
  await waitFor(() => evaluate(colors, 'document.querySelectorAll("input[type=color]").length === 3'));
  await evaluate(colors, `(() => {
    const input = document.querySelector('input[aria-label="背景色"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '#bbddcc');
    input.dispatchEvent(new Event('input', {bubbles:true}));
  })()`);
  await waitFor(() => evaluate(note, "getComputedStyle(document.querySelector('.app')).backgroundColor === 'rgb(187, 221, 204)'"));
  assert.equal(await evaluate(colors, '(await window.pinApi.getSettings()).defaultPaperColor'), original.defaultPaperColor);
  await evaluate(colors, "document.querySelector('.colors-titlebar button').click()");
  await waitFor(() => evaluate(note, 'window.pinApi.getColorPreview().then(value => value === null)'));
  assert.equal(await evaluate(note, '(await window.pinApi.getWidget()).noteText'), 'packaged cleanup check');
  assert.ok(fs.existsSync(path.join(profile, 'desk-widgets.sqlite')), 'Database must use the isolated profile');
  await require('../tests/packaged-workflow.cjs')({ evaluate, waitFor, page, connect, note, colors, profile });
  console.log('PASS: packaged app startup, isolated database migrations, native SQLite, preload, note save and color preview/cancel');
  console.log(`Profile: ${profile}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  sockets.forEach(socket => socket.close());
  if (processUnderTest?.pid && processUnderTest.exitCode === null) {
    spawnSync('taskkill', ['/PID', String(processUnderTest.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  }
});
