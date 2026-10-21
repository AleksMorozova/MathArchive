import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';

let parent: Server, trainer: Server, sink: Server;
const received: string[] = [];
const cookies: string[] = [];
const listen = (server: Server, port: number) => new Promise<void>(resolve => server.listen(port, resolve));
const close = (server: Server) => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));

test.beforeAll(async () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const parentPolicy: string = vercel.headers.flatMap((rule: { headers: { key: string; value: string }[] }) => rule.headers)
    .find((header: { key: string }) => header.key === 'Content-Security-Policy').value;
  expect(parentPolicy.match(/(?:^|;)\s*frame-src\s+([^;]+)/)?.[1].split(/\s+/)).toContain('https://trainers.morozovamath.com');
  // Replay the exact bytes and security headers exported by the real upload/controller integration test.
  const response = JSON.parse(readFileSync(process.env.TRAINER_BROWSER_FIXTURE_PATH!, 'utf8'));
  const headers = Object.fromEntries(Object.entries(response.headers).filter(([key]) => !['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'date'].includes(key.toLowerCase())));
  parent = createServer((req, res) => {
    if (req.url === '/test-parent.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end('localStorage.setItem("token","fake-secret")');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Exercise the deployed parent policy too; only map the content origin to the local test server.
    res.setHeader('Content-Security-Policy', parentPolicy.replaceAll('https://trainers.morozovamath.com', 'http://127.0.0.1:4188'));
    res.setHeader('Set-Cookie', 'matharchive-fake-session=fake; Path=/; HttpOnly; SameSite=Lax');
    res.end('<!doctype html><html><body data-secret="private"><a href="/materials">Повернутися до матеріалів</a><script src="/test-parent.js"></script><iframe title="Математичний тренажер" src="http://127.0.0.1:4188/trainer" sandbox="allow-scripts" referrerpolicy="no-referrer" style="width:100%;height:600px"></iframe></body></html>');
  });
  trainer = createServer((req, res) => {
    cookies.push(req.headers.cookie ?? '');
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, String(value));
    res.end(response.html);
  });
  sink = createServer((req, res) => { received.push(req.url ?? ''); res.setHeader('Content-Type', 'text/html'); res.end('<html><body>Navigation reached</body></html>'); });
  sink.on('upgrade', (req, socket) => { received.push(req.url ?? ''); socket.destroy(); });
  await listen(parent, 4187); await listen(trainer, 4188); await listen(sink, 4189);
});
test.afterAll(async () => { await Promise.all([close(parent), close(trainer), close(sink)]); });
test.beforeEach(() => { received.length = 0; cookies.length = 0; });

test('local math works while sandbox and CSP block application access and supported egress channels', async ({ page, context }) => {
  await page.goto('http://localhost:4187/materials');
  const frame = page.frameLocator('iframe[title="Математичний тренажер"]');
  await expect(frame.locator('body')).toHaveAttribute('data-ready', 'yes');
  await frame.getByRole('textbox', { name: 'Відповідь' }).fill('4');
  await frame.getByRole('button', { name: 'Перевірити', exact: true }).click();
  await expect(frame.locator('#feedback')).toHaveText('Правильно: 1 бал');
  for (const name of ['parent', 'storage', 'cookie', 'fetch', 'xhr', 'image', 'script', 'worker'])
    await expect(frame.locator('body')).toHaveAttribute('data-' + name, 'blocked');
  await frame.getByRole('button', { name: 'Перевірка ізоляції' }).click();
  await expect(frame.locator('body')).toHaveAttribute('data-popup', 'blocked');
  await page.waitForTimeout(500);
  expect(page.url()).toBe('http://localhost:4187/materials');
  expect(context.pages()).toHaveLength(1);
  expect(received).toEqual([]);
  expect(cookies.every(cookie => !cookie.includes('matharchive-fake-session'))).toBe(true);
  await expect(page.getByRole('link', { name: 'Повернутися до матеріалів' })).toBeVisible();
});

test('frame-ancestors rejects embedding by an unapproved origin', async ({ page }) => {
  await page.goto('http://127.0.0.1:4187/materials');
  await page.waitForTimeout(300);
  expect(await page.frameLocator('iframe').locator('#check').count()).toBe(0);
});

test('parent frame-src blocks external iframe navigation while keeping the parent page intact', async ({ page }) => {
  await page.goto('http://localhost:4187/materials');
  const violations: string[] = [];
  page.on('console', message => { if (message.text().includes('frame-src')) violations.push(message.text()); });
  await page.frameLocator('iframe[title="Математичний тренажер"]').getByRole('button', { name: 'Self navigation probe' }).click();
  await expect.poll(() => violations.length).toBeGreaterThan(0);
  expect(received).not.toContain('/navigation');
  expect(page.url()).toBe('http://localhost:4187/materials');
});
