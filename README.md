# 🚀 Zeabur Manager

一个美观、强大的 Zeabur 多账号管理工具，支持实时监控、一键登录、服务控制等功能。

> 🙏 本项目基于 [jiujiu532/zeabur-monitor](https://github.com/jiujiu532/zeabur-monitor) 开发，感谢原作者的贡献！

![](https://img.shields.io/badge/Node.js-18+-green.svg)
![](https://img.shields.io/badge/License-MIT-blue.svg)
![](https://img.shields.io/badge/Zeabur-Ready-blueviolet.svg)

## ✨ 新增功能

相比原版，本项目新增了以下功能：

- 🔑 **一键登录** - 快速登录 Zeabur 控制台（配合 Tampermonkey 脚本）
- 🎫 **Session Token 支持** - 解决 API Key 频繁过期问题
- 🤖 **AI Hub 余额显示** - 显示 AI Hub 余额信息
- 🔐 **Token 加密存储** - 使用 AES-256 加密保护敏感数据

## 📦 快速开始

### 环境要求

- Node.js 18+
- Zeabur 账号

### 获取认证信息

#### Session Token（推荐）
1. 登录 [Zeabur 控制台](https://dash.zeabur.com)
2. 按 F12 打开开发者工具 → Application → Cookies
3. 复制 `token` 的值（JWT 格式）

#### API Token
1. Zeabur 控制台 → Settings → Developer → Create Token
2. 复制生成的 Token（`sk-xxx` 格式）

### 部署

```bash
# 克隆项目
git clone https://github.com/asts-top/zeabur-manager.git
cd zeabur-manager

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 启动
npm start
```

### 环境变量

```env
PORT=3000

# 账号配置：邮箱:apiToken:sessionToken
ACCOUNTS=user@example.com:sk-xxx:eyJhbGci...

# 加密密钥（64位十六进制）
ACCOUNTS_SECRET=your_64_char_hex_secret
```

生成加密密钥：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 🔑 一键登录

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)
2. 访问面板，点击 **📥 安装 Tampermonkey 脚本**
3. 点击账号卡片的 **🔑 登录** 按钮

## 📄 许可证

MIT License

## 🙏 致谢

- [jiujiu532/zeabur-monitor](https://github.com/jiujiu532/zeabur-monitor) - 原项目
- [Zeabur](https://zeabur.com) - 云服务平台
