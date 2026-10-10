# 本地运行与个人部署

## 准备

需要 Node.js 24 和 npm。所有命令在仓库根目录执行。

```sh
npm ci
cp .env.example .env
```

在本机编辑 `.env`，填写 `COACH_PASSWORD`（至少 12 字符）和 `DASHSCOPE_API_KEY`。不要把真实值发到聊天、提交 Git 或写入前端配置。`COACH_ACCOUNT_NAME` 是显示名称，不是额外的用户账号。

默认百炼地址为中国内地区域。若你的 Key 属于其他区域，按百炼官方说明调整 `QWEN_BASE_URL` 与可用模型；不要仅凭变量存在就认定认证可用。

## 启动

```sh
npm run build
npm start
```

浏览器打开本机 3000 端口，使用个人密码登录；上传 `framework.md` 与 `materials.md` 后开始聊天。未配置模型 Key 时仍能导入、查看课程，但聊天会明确报告未配置。

开发时分别运行两个终端：

```sh
npm run dev
npm run dev:web
```

Vite 默认开发端口 5173，API 代理到 3000。`.env.example` 的 Cookie 设置仅适用于本地 HTTP。

仅做本机演示时可以设 `COACH_DEMO_MODEL=1`，页面会显示“测试模型模式”，回复为固定替身，不能当作百炼效果。不要用此模式公开部署。

## 运行验证

```sh
npm run check
npm run test:e2e
npm run format:check
```

端到端测试使用自己的测试数据库和测试密码，不调用真实模型。Linux 可使用 `/usr/bin/chromium`；其他平台可设置 `CHROMIUM_PATH`，或执行 `npx playwright install chromium` 使用 Playwright 浏览器。测试数据库与截图在 `test-results`，不提交 Git。

真实模型验证：关闭测试模型，配置 Key 后，用小型样例课程进行一轮中文对话，再刷新并继续；检查资料依据、恢复位置、模型错误反馈。这会产生 API 费用。当前没有凭据，尚未执行这一项。

## SQLite 与备份

默认数据库为 `data/coach.sqlite`。后端进程重启不丢数据；实例重建时必须保留数据库目录。一次只运行一个后端进程，不用共享数据库启动多实例。

```sh
npm run backup -- /安全备份目录/coach-backup.sqlite
```

脚本使用 SQLite 在线备份接口，会拒绝覆盖已有文件。备份包含课程、消息及会话信息，按个人资料妥善保存。

恢复时先停止应用，把当前数据库及同名 `-wal`、`-shm` 文件一起移到保留目录；将备份放到 `COACH_DB_PATH` 指定的位置，确保服务用户可写，再启动并检查课程与进度。不得运行时直接覆盖数据库。

## 手机使用与部署

建议一个低成本 Linux 服务器运行 Node 后端，由 HTTPS 反向代理提供同一域名的网页与 API。后端保持本机绑定，代理转发时保留原始 Host；数据库目录使用持久磁盘，配置定期备份和进程重启。

对外部署时将 `COACH_SECURE_COOKIE=true`，配置服务端密码与 Key，关闭测试模型，限制环境文件与数据库权限。`npm start` 依赖 tsx，因此当前运行部署需要保留 npm 的开发依赖，不能直接 `npm ci --omit=dev`。

手机浏览器打开 HTTPS 页面后，可通过浏览器菜单添加到主屏幕。当前有 Manifest 与独立窗口入口，没有离线缓存或推送通知；实际手机安装体验尚未验证。服务器租赁及域名配置不在本次本地实现中执行。

## 密码与会话

改变 `.env` 中的密码后重启服务。已有会话在过期前仍有效；若需要立即全部退出，停服务后删除数据库中的 `auth_sessions` 记录再启动。当前没有忘记密码邮件或多用户注册功能。
