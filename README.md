# Coach Agent Self

个人中文 AI 学习教练：导入标注好的 Markdown 框架与资料，联网调用通义千问进行讨论式学习。手机聊天界面包含可收起课程侧边栏，各课程独立保存对话、位置及进度，由你决定何时继续。

第一版使用 TypeScript、React、Fastify 和 SQLite，已有个人密码登录、课程导入、聊天、失败重试、学习推进、滚动课程摘要及数据库备份。真实百炼调用需配置服务端 Key。

```sh
npm ci
cp .env.example .env
# 在本机编辑 .env：填写个人密码及百炼 Key
npm run build
npm start
```

详细步骤：[运行说明](Docs/RUNNING.md)。

```sh
npm run check
npm run test:e2e
```

- [文档与原型](Docs/README.md)
- [Markdown 标注协议](Docs/MARKDOWN_PROTOCOL.md)
- [外部模型标注提示词](Docs/ANNOTATION_PROMPT.md)
- [项目目录规范](Docs/PROJECT_STRUCTURE.md)
- [第一版实现默认值与限制](Docs/decisions/001-FIRST_RELEASE.md)

代码按前端、HTTP 接口、功能服务、模型/存储适配和测试分开组织。当前没有部署服务器；模型真实效果和实际手机安装体验仍需验证。不提供网页搜索、离线问答、选择题、复习或笔记功能。
