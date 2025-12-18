# 🚀 Zeabur Manager

一个美观、强大的 Zeabur 多账号管理工具，支持实时监控、一键登录、服务控制等功能。

> 🙏 本项目基于 [jiujiu532/zeabur-monitor](https://github.com/jiujiu532/zeabur-monitor) 开发，感谢原作者的贡献！

![](https://img.shields.io/badge/Node.js-18+-green.svg)
![](https://img.shields.io/badge/License-MIT-blue.svg)
![](https://img.shields.io/badge/Zeabur-Ready-blueviolet.svg)

## ✨ 功能特性

### 原有功能
- 🎨 **现代化 UI** - 粉色主题 + 玻璃拟态效果 + 动漫背景
- 💰 **实时余额监控** - 显示每月免费额度剩余（$X.XX / $5.00）
- 📊 **项目费用追踪** - 每个项目的实时费用统计
- ✏️ **项目快速改名** - 点击铅笔图标即可重命名项目
- 🌐 **域名显示** - 显示项目的所有域名，点击直接访问
- 🐳 **服务状态监控** - 显示所有服务的运行状态和资源配置
- 👥 **多账号支持** - 同时管理多个 Zeabur 账号
- 🔄 **自动刷新** - 每 90 秒自动更新数据
- 🎚️ **透明度调节** - 可调节卡片透明度（0-100%）
- 📱 **响应式设计** - 完美适配各种屏幕尺寸
- 🔐 **密码保护** - 管理员密码验证，保护账号安全
- 💾 **服务器存储** - 账号数据存储在服务器，多设备自动同步
- ⏸️ **服务控制** - 暂停、启动、重启服务
- 📋 **查看日志** - 实时查看服务运行日志

### 🆕 新增功能
- 🔑 **一键登录** - 快速登录 Zeabur 控制台（配合 Tampermonkey 脚本）
- 🎫 **Session Token 支持** - 解决 API Key 频繁过期问题
- 🤖 **AI Hub 余额显示** - 显示 AI Hub 余额信息
- 🔐 **Token 加密存储** - 使用 AES-256-GCM 加密保护敏感数据

## 📦 快速开始

### 环境要求

- Node.js 18+
- Zeabur 账号

### 获取认证信息

#### 方式一：Session Token（推荐，支持一键登录）
1. 登录 [Zeabur 控制台](https://dash.zeabur.com)
2. 按 F12 打开开发者工具
3. 切换到 **Application** 标签
4. 在左侧找到 **Cookies** → `dash.zeabur.com`
5. 复制 `token` 的值（JWT 格式：`eyJhbGci...`）

#### 方式二：API Token（基础功能）
1. 登录 [Zeabur 控制台](https://zeabur.com)
2. 点击右上角头像 → **Settings**
3. 找到 **Developer** 或 **API Keys** 选项
4. 点击 **Create Token**
5. 复制生成的 Token（格式：`sk-xxxxxxxxxxxxxxxx`）

> ⚠️ Session Token 有效期较长且支持一键登录，但可能会过期。API Token 更稳定但不支持一键登录功能。

## 🚀 部署方式

### 方式一：Zeabur 一键部署（推荐）

1. **Fork 本项目**到你的 GitHub 账号

2. **登录 Zeabur** 并创建新项目
   - 访问 [Zeabur 控制台](https://dash.zeabur.com)
   - 点击 **Create Project**
   - 选择部署区域

3. **添加服务**
   - 点击 **Add Service** → **GitHub**
   - 选择你 Fork 的 `zeabur-manager` 仓库
   - 点击 **Deploy**

4. **配置环境变量**（可选）
   - 点击服务 → **Variables**
   - 添加 `ACCOUNTS` 和 `ACCOUNTS_SECRET`

5. **生成域名**
   - 点击 **Domains** → **Generate Domain**
   - 访问生成的域名即可使用

### 方式二：VPS / 服务器部署

```bash
# 1. 克隆项目
git clone https://github.com/asts-top/zeabur-manager.git
cd zeabur-manager

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
nano .env  # 编辑配置

# 4. 启动服务
npm start

# 或使用 PM2 后台运行
pm2 start server.js --name zeabur-manager
```

### 方式三：Docker 部署

```bash
# 构建镜像
docker build -t zeabur-manager .

# 运行容器
docker run -d -p 3000:3000 \
  -e ACCOUNTS="邮箱:apiToken:sessionToken" \
  -e ACCOUNTS_SECRET="your_secret" \
  zeabur-manager
```

## ⚙️ 环境变量配置

创建 `.env` 文件：

```env
# 服务端口
PORT=3000

# 账号配置（支持两种格式）
# 格式1：仅 API Token（基础功能）
# ACCOUNTS=邮箱1:apiToken1,邮箱2:apiToken2

# 格式2：API Token + Session Token（完整功能，支持一键登录）
ACCOUNTS=邮箱1:apiToken1:sessionToken1,邮箱2:apiToken2:sessionToken2

# 加密密钥（64位十六进制，用于加密存储的 Token）
ACCOUNTS_SECRET=your_64_char_hex_secret
```

### 生成加密密钥

```bash
node generate-secret.js
# 或
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 📖 使用说明

### 首次使用

1. 访问应用后，首次使用需要设置管理员密码（至少 6 位）
2. 设置完成后，使用密码登录
3. 点击 **"⚙️ 管理账号"** 添加 Zeabur 账号

### 添加账号

#### 单个添加
1. 点击 **"⚙️ 管理账号"**
2. 输入账号名称和 API Token
3. 点击 **"➕ 添加到列表"**

#### 批量添加
支持以下格式（每行一个账号）：
- `账号名称:API_Token`
- `账号名称：API_Token`（中文冒号）
- `账号名称(API_Token)`
- `账号名称（API_Token）`（中文括号）

### 服务控制

- **暂停服务**：点击 **⏸️ 暂停** 按钮
- **启动服务**：点击 **▶️ 启动** 按钮  
- **重启服务**：点击 **🔄 重启** 按钮
- **查看日志**：点击 **📋 日志** 按钮

### 🔑 一键登录 Zeabur 控制台

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 访问监控面板，点击使用说明中的 **📥 安装 Tampermonkey 脚本**
3. 点击账号卡片上的 **🔑 登录** 按钮
4. 自动跳转到 Zeabur 控制台并完成登录

> 💡 如果没有安装 Tampermonkey，点击登录后会显示手动设置 Cookie 的说明页面。

## 📁 项目结构

```
zeabur-manager/
├── public/
│   ├── index.html              # 前端页面
│   ├── bg.png                  # 背景图片
│   ├── favicon.png             # 网站图标
│   └── zeabur-login.user.js    # Tampermonkey 一键登录脚本
├── server.js                   # 后端服务
├── crypto-utils.js             # 加密工具
├── generate-secret.js          # 密钥生成工具
├── package.json                # 项目配置
├── .env.example                # 环境变量示例
├── .gitignore                  # Git 忽略规则
├── zbpack.json                 # Zeabur 配置
├── README.md                   # 项目说明
└── DEPLOY.md                   # 详细部署指南
```

## 🔧 技术栈

- **后端**：Node.js + Express
- **前端**：Vue.js 3 (CDN)
- **API**：Zeabur GraphQL API
- **加密**：AES-256-GCM
- **样式**：原生 CSS（玻璃拟态效果）

## 🔒 安全说明

### 密码保护
- 首次使用需要设置管理员密码（至少 6 位）
- 密码存储在服务器的 `password.json` 文件中
- 登录后 10 天内自动保持登录状态

### Token 安全
- 支持 AES-256-GCM 加密存储 Token
- 输入时自动打码显示
- 不会暴露在前端代码或浏览器中

### 重要提示
⚠️ **请勿将以下文件提交到 Git：**
- `.env` - 环境变量
- `accounts.json` - 账号数据
- `password.json` - 管理员密码

## 🎨 自定义

### 更换背景图片
替换 `public/bg.png` 为你喜欢的图片

### 调整透明度
使用页面上的透明度滑块调节

### 修改主题色
在 `public/index.html` 中搜索 `#f696c6` 并替换为你喜欢的颜色

## ❓ 常见问题

### Q: 显示 $5 余额和 0 项目？
A: 可能是 Token 过期了，请更新 Session Token 或 API Token。

### Q: 一键登录不工作？
A: 确保已安装 Tampermonkey 并启用了登录脚本。

### Q: 数据会丢失吗？
A: Zeabur 部署时文件系统是临时的，建议使用环境变量配置账号，或定期备份。

### Q: 如何更新？
A: 在 GitHub 更新代码后，Zeabur 会自动重新部署。

更多问题请查看 [DEPLOY.md](./DEPLOY.md)

## 📄 许可证

MIT License - 自由使用和修改

## 🙏 致谢

- [jiujiu532/zeabur-monitor](https://github.com/jiujiu532/zeabur-monitor) - 原项目
- [Zeabur](https://zeabur.com) - 云服务平台
- [Vue.js](https://vuejs.org) - 前端框架
- [Express](https://expressjs.com) - 后端框架

---

如果这个项目对你有帮助，请给个 Star ⭐
