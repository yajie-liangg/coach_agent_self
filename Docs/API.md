# 第一版 HTTP API

JSON 输入输出，同源访问。除 health、session、login 外，所有 API 要求已登录 Cookie；失败返回 `{ "error": "中文说明" }`，不返回原始供应商错误或密钥。

| 方法 | 路径 | 输入 | 输出 |
| --- | --- | --- | --- |
| GET | `/api/health` | 无 | `{ok:true}`，只证明服务存活 |
| GET | `/api/session` | 无 | authenticated、accountName、demo |
| POST | `/api/login` | password | 设置 HttpOnly 会话 Cookie |
| POST | `/api/logout` | 空对象 | 撤销当前会话 |
| GET | `/api/courses` | 无 | 课程列表，含阶段、位置和进度，不含 messages |
| POST | `/api/courses` | name、framework、materials（三个字符串） | 201 与新课程完整视图 |
| GET | `/api/courses/:id` | 无 | 课程视图及消息 |
| POST | `/api/courses/:id/advance` | operationId、version | 更新后的课程视图 |
| POST | `/api/courses/:id/messages` | requestId、content | 保存回复后的课程视图 |

课程视图包含 id、name、phase、currentNodeId、currentTitle、version、completed、total、progress、resumeQuestion、messages。阶段为 overview/detail/finished。消息含 requestId、role、content、status 和时间。

聊天与推进请求分别使用调用方生成的唯一 ID。失败重试必须复用原 ID 和相同输入；重复成功请求不重复生成/计数。推进附上读取时的 version，迟到操作返回 409。生成期间同课程不能推进或再发送；其他课程的数据仍隔离。

推进接口只更改状态；网页在推进成功后单独调用消息接口引入下一部分。若模型失败，状态仍保持用户刚才确认的位置。用户话语或模型建议不会调用推进接口。

401 表示未登录，400 表示格式或材料校验错误，404 表示课程不存在，409 表示冲突，413 表示上传过大，429 表示操作过频，502/503 表示模型故障或未配置。
