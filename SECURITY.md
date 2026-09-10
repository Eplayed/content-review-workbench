# 安全政策

## 支持的版本

| 版本 | 是否维护 |
| --- | --- |
| 0.2.x | ✅ |
| < 0.2 | ❌ |

## 上报漏洞

请**不要**在公开 issue 中提交安全细节。推荐用 GitHub 的
[私密漏洞上报](https://docs.github.com/zh/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
（仓库 Security 标签页 → Report a vulnerability）。

请附上：影响版本、复现步骤、影响面（能否读取/篡改数据）、你的建议修复方向。

我们会在收到后 72 小时内确认，并在修复发布后致谢（如你愿意署名）。

## 部署安全建议

- 公网部署**必须**设置 `APP_PASSWORD`（或 `AUTH_TOKEN`），否则任何拿到地址的人都能读写你的数据
- 不要把 `data/` 目录（含 SQLite 数据库）暴露到公网或提交进 Git
- AI 供应商的 API Key 只保存在服务端 `settings` 表，不会返回给前端；备份文件同样不含 Key
- 建议放在反向代理（Nginx/Caddy）后面并启用 HTTPS
