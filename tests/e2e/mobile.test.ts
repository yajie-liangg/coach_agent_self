import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
async function createCourse(
  page: import('@playwright/test').Page,
  name: string,
  material?: string,
) {
  await expect(page.getByRole('button', { name: '打开课程侧边栏' })).toBeVisible();
  if (!(await page.getByRole('button', { name: /添加新课程$/ }).count()))
    await page.getByRole('button', { name: '打开课程侧边栏' }).click();
  await page
    .getByRole('button', { name: /添加新课程$/ })
    .first()
    .click();
  await page.getByLabel('课程名称').fill(name);
  await page.getByLabel('框架文件').setInputFiles({
    name: 'framework.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(readFileSync('tests/fixtures/framework.md')),
  });
  await page.getByLabel('资料文件').setInputFiles({
    name: 'materials.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(material ?? readFileSync('tests/fixtures/materials.md', 'utf8')),
  });
  await page.getByRole('button', { name: '创建课程', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
test('手机课程导入、聊天、推进、切换和刷新恢复', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('个人密码').fill('e2e-test-password-only');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await createCourse(page, '产品经理基础');
  await page.getByLabel('你的回答').fill('先给我解释整体框架');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(
    page.getByText('我们先看整个框架，各部分之间有什么联系？', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: '开始深入' }).click();
  await expect(page.getByText('当前：识别真实需求')).toBeVisible();
  await page.getByRole('button', { name: '确认完成，下一步' }).click();
  await expect(page.getByText('当前：判断需求优先级')).toBeVisible();
  await page.getByRole('button', { name: '打开课程侧边栏' }).click();
  await expect(page.getByRole('complementary')).toBeVisible();
  await expect(page.getByText('50%', { exact: true })).toBeVisible();
  await createCourse(page, '第二门课程');
  await expect(page.getByText('先给我解释整体框架', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: '打开课程侧边栏' }).click();
  await page.getByRole('button', { name: /产品经理基础 50%/ }).click();
  await expect(page.getByText('当前：判断需求优先级')).toBeVisible();
  await expect(page.getByText('先给我解释整体框架', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('当前：判断需求优先级')).toBeVisible();
  await expect(page.getByLabel('你的回答')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/mobile-chat.png', fullPage: true });
  await page.getByRole('button', { name: '打开课程侧边栏' }).click();
  await page.screenshot({ path: 'test-results/mobile-drawer.png', fullPage: true });
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByLabel('个人密码')).toBeVisible();
});
test('Markdown 渲染不执行脚本和原始 HTML', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('个人密码').fill('e2e-test-password-only');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.evaluate(() => {
    (window as unknown as { xss: boolean }).xss = false;
  });
  await createCourse(
    page,
    '安全样例',
    readFileSync('tests/fixtures/materials.md', 'utf8') + '\n<script>window.xss=true</script>',
  );
  await page.getByLabel('你的回答').fill('<img src=x onerror="window.xss=true">');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('[测试模型，非百炼]', { exact: false }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { xss: boolean }).xss)).toBe(false);
});
