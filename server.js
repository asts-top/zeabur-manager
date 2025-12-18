require('dotenv').config();
const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { encryptData, decryptData } = require('./crypto-utils');

const app = express();
const PORT = process.env.PORT || 3000;

// 加密密钥（用于加密存储的 API Token）
const ACCOUNTS_SECRET = process.env.ACCOUNTS_SECRET;
const ENCRYPTION_ENABLED = ACCOUNTS_SECRET && ACCOUNTS_SECRET.length === 64;

app.use(cors());
app.use(express.json());

// Session管理 - 存储在内存中,重启服务器后清空
const activeSessions = new Map(); // { token: { createdAt: timestamp } }
const SESSION_DURATION = 10 * 24 * 60 * 60 * 1000; // 10天

// 生成随机token
function generateToken() {
  return 'session_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// 清理过期session
function cleanExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of activeSessions.entries()) {
    if (now - session.createdAt > SESSION_DURATION) {
      activeSessions.delete(token);
    }
  }
}

// 每小时清理一次过期session
setInterval(cleanExpiredSessions, 60 * 60 * 1000);

// 密码验证中间件
function requireAuth(req, res, next) {
  const password = req.headers['x-admin-password'];
  const sessionToken = req.headers['x-session-token'];
  const savedPassword = loadAdminPassword();
  
  if (!savedPassword) {
    // 如果没有设置密码，允许访问（首次设置）
    next();
  } else if (sessionToken && activeSessions.has(sessionToken)) {
    // 检查session是否有效
    const session = activeSessions.get(sessionToken);
    if (Date.now() - session.createdAt < SESSION_DURATION) {
      next();
    } else {
      activeSessions.delete(sessionToken);
      res.status(401).json({ error: 'Session已过期，请重新登录' });
    }
  } else if (password === savedPassword) {
    next();
  } else {
    res.status(401).json({ error: '密码错误或Session无效' });
  }
}

app.use(express.static('public'));

// 数据文件路径
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
const PASSWORD_FILE = path.join(__dirname, 'password.json');

// 读取服务器存储的账号
function loadServerAccounts() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
      const accounts = JSON.parse(data);
      
      // 如果启用了加密,解密 Token
      if (ENCRYPTION_ENABLED) {
        return accounts.map(account => {
          // 如果账号有加密的 Token,解密它
          if (account.encryptedToken) {
            try {
              const token = decryptData(account.encryptedToken, ACCOUNTS_SECRET);
              return { ...account, token, encryptedToken: undefined };
            } catch (e) {
              console.error(`❌ 解密账号 [${account.name}] 的 Token 失败:`, e.message);
              return account;
            }
          }
          return account;
        });
      }
      
      return accounts;
    }
  } catch (e) {
    console.error('❌ 读取账号文件失败:', e.message);
  }
  return [];
}

// 保存账号到服务器
function saveServerAccounts(accounts) {
  try {
    let accountsToSave = accounts;
    
    // 如果启用了加密,加密 Token
    if (ENCRYPTION_ENABLED) {
      accountsToSave = accounts.map(account => {
        if (account.token) {
          try {
            const encryptedToken = encryptData(account.token, ACCOUNTS_SECRET);
            // 保存时移除明文 token,只保存加密后的
            const { token, ...rest } = account;
            return { ...rest, encryptedToken };
          } catch (e) {
            console.error(`❌ 加密账号 [${account.name}] 的 Token 失败:`, e.message);
            return account;
          }
        }
        return account;
      });
      console.log('🔐 账号 Token 已加密存储');
    }
    
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accountsToSave, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('❌ 保存账号文件失败:', e.message);
    return false;
  }
}

// 读取管理员密码
function loadAdminPassword() {
  try {
    if (fs.existsSync(PASSWORD_FILE)) {
      const data = fs.readFileSync(PASSWORD_FILE, 'utf8');
      return JSON.parse(data).password;
    }
  } catch (e) {
    console.error('❌ 读取密码文件失败:', e.message);
  }
  return null;
}

// 保存管理员密码
function saveAdminPassword(password) {
  try {
    fs.writeFileSync(PASSWORD_FILE, JSON.stringify({ password }, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('❌ 保存密码文件失败:', e.message);
    return false;
  }
}

// Zeabur GraphQL 查询
async function queryZeabur(token, query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });
    const options = {
      hostname: 'api.zeabur.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(data);
    req.end();
  });
}

// 获取用户信息和项目
async function fetchAccountData(token) {
  // 查询用户信息
  const userQuery = `
    query {
      me {
        _id
        username
        email
        credit
      }
    }
  `;
  
  // 查询项目信息
  const projectsQuery = `
    query {
      projects {
        edges {
          node {
            _id
            name
            region {
              name
            }
            environments {
              _id
            }
            services {
              _id
              name
              status
              template
              resourceLimit {
                cpu
                memory
              }
              domains {
                domain
                isGenerated
              }
            }
          }
        }
      }
    }
  `;
  
  // 查询 AI Hub 余额
  const aihubQuery = `
    query GetAIHubTenant {
      aihubTenant {
        balance
        keys {
          keyID
          alias
          cost
        }
      }
    }
  `;
  
  const [userData, projectsData, aihubData] = await Promise.all([
    queryZeabur(token, userQuery),
    queryZeabur(token, projectsQuery),
    queryZeabur(token, aihubQuery).catch(() => ({ data: { aihubTenant: null } }))
  ]);
  
  return {
    user: userData.data?.me || {},
    projects: (projectsData.data?.projects?.edges || []).map(edge => edge.node),
    aihub: aihubData.data?.aihubTenant || null
  };
}

// 获取项目用量数据
async function fetchUsageData(token, userID, projects = []) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  // 使用明天的日期确保包含今天的所有数据
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const toDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  
  const usageQuery = {
    operationName: 'GetHeaderMonthlyUsage',
    variables: {
      from: fromDate,
      to: toDate,
      groupByEntity: 'PROJECT',
      groupByTime: 'DAY',
      groupByType: 'ALL',
      userID: userID
    },
    query: `query GetHeaderMonthlyUsage($from: String!, $to: String!, $groupByEntity: GroupByEntity, $groupByTime: GroupByTime, $groupByType: GroupByType, $userID: ObjectID!) {
      usages(
        from: $from
        to: $to
        groupByEntity: $groupByEntity
        groupByTime: $groupByTime
        groupByType: $groupByType
        userID: $userID
      ) {
        categories
        data {
          id
          name
          groupByEntity
          usageOfEntity
          __typename
        }
        __typename
      }
    }`
  };
  
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(usageQuery);
    const options = {
      hostname: 'api.zeabur.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          const usages = result.data?.usages?.data || [];
          
          // 计算每个项目的总费用
          const projectCosts = {};
          let totalUsage = 0;
          
          usages.forEach(project => {
            const projectTotal = project.usageOfEntity.reduce((a, b) => a + b, 0);
            // 单个项目显示：向上取整到 $0.01（与 Zeabur 官方一致）
            const displayCost = projectTotal > 0 ? Math.ceil(projectTotal * 100) / 100 : 0;
            projectCosts[project.id] = displayCost;
            // 总用量计算：使用原始费用（不取整，保证总余额准确）
            totalUsage += projectTotal;
          });
          
          resolve({
            projectCosts,
            totalUsage,
            freeQuotaRemaining: 5 - totalUsage, // 免费额度 $5
            freeQuotaLimit: 5
          });
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(data);
    req.end();
  });
}

// 临时账号API - 获取账号信息
app.post('/api/temp-accounts', requireAuth, express.json(), async (req, res) => {
  const { accounts } = req.body;
  
  console.log('📥 收到账号请求:', accounts?.length, '个账号');
  
  if (!accounts || !Array.isArray(accounts)) {
    return res.status(400).json({ error: '无效的账号列表' });
  }
  
  const results = await Promise.all(accounts.map(async (account) => {
    try {
      console.log(`🔍 正在获取账号 [${account.name}] 的数据...`);
      // 优先使用 sessionToken，如果没有则使用 token (API Key)
      const authToken = account.sessionToken || account.token;
      console.log(`   使用的认证方式: ${account.sessionToken ? 'sessionToken' : 'apiKey'}`);
      const { user, projects, aihub } = await fetchAccountData(authToken);
      
      // 检查 API 是否返回了有效数据
      if (!user || !user._id) {
        console.log(`   ⚠️ API 返回无效数据，可能 token 已过期`);
        return {
          name: account.name,
          success: false,
          error: 'Token 可能已过期，请更新 sessionToken'
        };
      }
      
      console.log(`   API 返回的 credit: ${user.credit}, 项目数: ${projects.length}`);
      
      // 获取用量数据
      let usageData = { totalUsage: 0, freeQuotaRemaining: 5, freeQuotaLimit: 5 };
      if (user._id) {
        try {
          usageData = await fetchUsageData(authToken, user._id, projects);
          console.log(`💰 [${account.name}] 用量: $${usageData.totalUsage.toFixed(2)}, 剩余: $${usageData.freeQuotaRemaining.toFixed(2)}`);
        } catch (e) {
          console.log(`⚠️ [${account.name}] 获取用量失败:`, e.message);
        }
      }
      
      // 计算剩余额度并转换为 credit（以分为单位）
      const creditInCents = Math.round(usageData.freeQuotaRemaining * 100);
      
      return {
        name: account.name,
        success: true,
        data: {
          ...user,
          credit: creditInCents, // 使用计算的剩余额度
          totalUsage: usageData.totalUsage,
          freeQuotaLimit: usageData.freeQuotaLimit
        },
        aihub: aihub
      };
    } catch (error) {
      console.error(`❌ [${account.name}] 错误:`, error.message);
      return {
        name: account.name,
        success: false,
        error: error.message
      };
    }
  }));
  
  console.log('📤 返回结果:', results.length, '个账号');
  res.json(results);
});

// 临时账号API - 获取项目信息
app.post('/api/temp-projects', requireAuth, express.json(), async (req, res) => {
  const { accounts } = req.body;
  
  console.log('📥 收到项目请求:', accounts?.length, '个账号');
  
  if (!accounts || !Array.isArray(accounts)) {
    return res.status(400).json({ error: '无效的账号列表' });
  }
  
  const results = await Promise.all(accounts.map(async (account) => {
    try {
      console.log(`🔍 正在获取账号 [${account.name}] 的项目...`);
      // 优先使用 sessionToken
      const authToken = account.sessionToken || account.token;
      const { user, projects } = await fetchAccountData(authToken);
      
      // 获取用量数据
      let projectCosts = {};
      if (user._id) {
        try {
          const usageData = await fetchUsageData(authToken, user._id, projects);
          projectCosts = usageData.projectCosts;
        } catch (e) {
          console.log(`⚠️ [${account.name}] 获取用量失败:`, e.message);
        }
      }
      
      console.log(`📦 [${account.name}] 找到 ${projects.length} 个项目`);
      
      const projectsWithCost = projects.map(project => {
        const cost = projectCosts[project._id] || 0;
        console.log(`  - ${project.name}: $${cost.toFixed(2)}`);
        
        return {
          _id: project._id,
          name: project.name,
          region: project.region?.name || 'Unknown',
          environments: project.environments || [],
          services: project.services || [],
          cost: cost,
          hasCostData: cost > 0
        };
      });
      
      return {
        name: account.name,
        success: true,
        projects: projectsWithCost
      };
    } catch (error) {
      console.error(`❌ [${account.name}] 错误:`, error.message);
      return {
        name: account.name,
        success: false,
        error: error.message
      };
    }
  }));
  
  console.log('📤 返回项目结果');
  res.json(results);
});

// 验证账号
app.post('/api/validate-account', requireAuth, express.json(), async (req, res) => {
  const { accountName, apiToken } = req.body;
  
  if (!accountName || !apiToken) {
    return res.status(400).json({ error: '账号名称和 API Token 不能为空' });
  }
  
  try {
    const { user } = await fetchAccountData(apiToken);
    
    if (user._id) {
      res.json({
        success: true,
        message: '账号验证成功！',
        userData: user,
        accountName,
        apiToken
      });
    } else {
      res.status(400).json({ error: 'API Token 无效或没有权限' });
    }
  } catch (error) {
    res.status(400).json({ error: 'API Token 验证失败: ' + error.message });
  }
});

// 从环境变量读取预配置的账号
function getEnvAccounts() {
  const accountsEnv = process.env.ACCOUNTS;
  if (!accountsEnv) return [];
  
  try {
    // 格式: "账号名称:apiToken:sessionToken,账号2名称:apiToken2:sessionToken2"
    return accountsEnv.split(',').map(item => {
      const parts = item.split(':');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const token = parts[1].trim();
        // 第三部分是 sessionToken（可选）
        const sessionToken = parts.slice(2).join(':').trim() || null;
        return { name, token, sessionToken };
      }
      return null;
    }).filter(acc => acc && acc.name && acc.token);
  } catch (e) {
    console.error('❌ 解析环境变量 ACCOUNTS 失败:', e.message);
    return [];
  }
}

// 检查是否已设置密码
// 检查加密密钥是否已设置
app.get('/api/check-encryption', (req, res) => {
  const crypto = require('crypto');
  // 生成一个随机密钥供用户使用
  const suggestedSecret = crypto.randomBytes(32).toString('hex');
  
  res.json({
    isConfigured: ENCRYPTION_ENABLED,
    suggestedSecret: suggestedSecret
  });
});

app.get('/api/check-password', (req, res) => {
  const savedPassword = loadAdminPassword();
  res.json({ hasPassword: !!savedPassword });
});

// 设置管理员密码（首次）
app.post('/api/set-password', (req, res) => {
  const { password } = req.body;
  const savedPassword = loadAdminPassword();
  
  if (savedPassword) {
    return res.status(400).json({ error: '密码已设置，无法重复设置' });
  }
  
  if (!password || password.length < 6) {
    return res.status(400).json({ error: '密码长度至少6位' });
  }
  
  if (saveAdminPassword(password)) {
    console.log('✅ 管理员密码已设置');
    res.json({ success: true });
  } else {
    res.status(500).json({ error: '保存密码失败' });
  }
});

// 验证密码
app.post('/api/verify-password', (req, res) => {
  const { password } = req.body;
  const savedPassword = loadAdminPassword();
  
  if (!savedPassword) {
    return res.status(400).json({ success: false, error: '请先设置密码' });
  }
  
  if (password === savedPassword) {
    // 生成新的session token
    const sessionToken = generateToken();
    activeSessions.set(sessionToken, { createdAt: Date.now() });
    console.log(`✅ 用户登录成功，生成Session: ${sessionToken.substring(0, 20)}...`);
    res.json({ success: true, sessionToken });
  } else {
    res.status(401).json({ success: false, error: '密码错误' });
  }
});

// 获取所有账号（服务器存储 + 环境变量）
app.get('/api/server-accounts', requireAuth, async (req, res) => {
  const serverAccounts = loadServerAccounts();
  const envAccounts = getEnvAccounts();
  
  // 合并账号，环境变量账号优先
  const allAccounts = [...envAccounts, ...serverAccounts];
  console.log(`📋 返回 ${allAccounts.length} 个账号 (环境变量: ${envAccounts.length}, 服务器: ${serverAccounts.length})`);
  res.json(allAccounts);
});

// 获取账号的 Session Token 用于登录 Zeabur 控制台
app.post('/api/get-session-token', requireAuth, async (req, res) => {
  const { accountName } = req.body;
  
  if (!accountName) {
    return res.status(400).json({ error: '缺少账号名称' });
  }
  
  const serverAccounts = loadServerAccounts();
  const envAccounts = getEnvAccounts();
  const allAccounts = [...envAccounts, ...serverAccounts];
  
  const account = allAccounts.find(acc => acc.name === accountName);
  
  if (!account) {
    return res.status(404).json({ error: '未找到账号' });
  }
  
  if (!account.sessionToken) {
    return res.status(400).json({ error: '该账号没有配置 Session Token' });
  }
  
  console.log(`🔑 返回账号 [${accountName}] 的 Session Token`);
  res.json({ sessionToken: account.sessionToken });
});

// 登录跳转页面 - 返回一个HTML页面，用JS设置cookie后跳转
app.get('/api/zeabur-login/:accountName', requireAuth, async (req, res) => {
  const { accountName } = req.params;
  
  const serverAccounts = loadServerAccounts();
  const envAccounts = getEnvAccounts();
  const allAccounts = [...envAccounts, ...serverAccounts];
  
  const account = allAccounts.find(acc => acc.name === decodeURIComponent(accountName));
  
  if (!account || !account.sessionToken) {
    return res.status(404).send('账号不存在或没有 Session Token');
  }
  
  // 返回一个HTML页面，在zeabur.com域名下设置cookie
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>正在登录 Zeabur...</title>
      <style>
        body { font-family: -apple-system, sans-serif; background: #1a1a2e; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .loader { text-align: center; }
        .spinner { width: 50px; height: 50px; border: 4px solid #f696c6; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="loader">
        <div class="spinner"></div>
        <p>正在登录 Zeabur...</p>
        <p style="font-size: 12px; color: #888;">如果没有自动跳转，请手动刷新页面</p>
      </div>
      <script>
        // 存储token到localStorage，然后跳转到zeabur
        const token = '${account.sessionToken}';
        
        // 方法1: 尝试通过iframe在zeabur域名下执行
        // 由于跨域限制，这个方法可能不工作
        
        // 方法2: 打开zeabur页面，用户需要在控制台手动设置cookie
        // 我们把token存到剪贴板
        navigator.clipboard.writeText('document.cookie = "token=' + token + '; path=/; domain=.zeabur.com; max-age=31536000";').then(() => {
          // 跳转到zeabur
          window.location.href = 'https://dash.zeabur.com';
        }).catch(() => {
          window.location.href = 'https://dash.zeabur.com';
        });
      </script>
    </body>
    </html>
  `;
  
  res.send(html);
});

// 保存账号到服务器
app.post('/api/server-accounts', requireAuth, async (req, res) => {
  const { accounts } = req.body;
  
  if (!accounts || !Array.isArray(accounts)) {
    return res.status(400).json({ error: '无效的账号列表' });
  }
  
  if (saveServerAccounts(accounts)) {
    console.log(`✅ 保存 ${accounts.length} 个账号到服务器`);
    res.json({ success: true, message: '账号已保存到服务器' });
  } else {
    res.status(500).json({ error: '保存失败' });
  }
});

// 删除服务器账号
app.delete('/api/server-accounts/:index', requireAuth, async (req, res) => {
  const index = parseInt(req.params.index);
  const accounts = loadServerAccounts();
  
  if (index >= 0 && index < accounts.length) {
    const removed = accounts.splice(index, 1);
    if (saveServerAccounts(accounts)) {
      console.log(`🗑️ 删除账号: ${removed[0].name}`);
      res.json({ success: true, message: '账号已删除' });
    } else {
      res.status(500).json({ error: '删除失败' });
    }
  } else {
    res.status(404).json({ error: '账号不存在' });
  }
});

// 服务器配置的账号API（兼容旧版本）
app.get('/api/accounts', async (req, res) => {
  res.json([]);
});

app.get('/api/projects', async (req, res) => {
  res.json([]);
});

// 暂停服务
app.post('/api/service/pause', requireAuth, async (req, res) => {
  const { token, serviceId, environmentId } = req.body;
  
  if (!token || !serviceId || !environmentId) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  
  try {
    const mutation = `mutation { suspendService(serviceID: "${serviceId}", environmentID: "${environmentId}") }`;
    const result = await queryZeabur(token, mutation);
    
    if (result.data?.suspendService) {
      res.json({ success: true, message: '服务已暂停' });
    } else {
      res.status(400).json({ error: '暂停失败', details: result });
    }
  } catch (error) {
    res.status(500).json({ error: '暂停服务失败: ' + error.message });
  }
});

// 重启服务
app.post('/api/service/restart', requireAuth, async (req, res) => {
  const { token, serviceId, environmentId } = req.body;
  
  if (!token || !serviceId || !environmentId) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  
  try {
    const mutation = `mutation { restartService(serviceID: "${serviceId}", environmentID: "${environmentId}") }`;
    const result = await queryZeabur(token, mutation);
    
    if (result.data?.restartService) {
      res.json({ success: true, message: '服务已重启' });
    } else {
      res.status(400).json({ error: '重启失败', details: result });
    }
  } catch (error) {
    res.status(500).json({ error: '重启服务失败: ' + error.message });
  }
});

// 获取服务日志
app.post('/api/service/logs', requireAuth, express.json(), async (req, res) => {
  const { token, serviceId, environmentId, projectId, limit = 200 } = req.body;
  
  if (!token || !serviceId || !environmentId || !projectId) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  
  try {
    const query = `
      query {
        runtimeLogs(
          projectID: "${projectId}"
          serviceID: "${serviceId}"
          environmentID: "${environmentId}"
        ) {
          message
          timestamp
        }
      }
    `;
    
    const result = await queryZeabur(token, query);
    
    if (result.data?.runtimeLogs) {
      // 按时间戳排序，最新的在最后
      const sortedLogs = result.data.runtimeLogs.sort((a, b) => {
        return new Date(a.timestamp) - new Date(b.timestamp);
      });
      
      // 获取最后 N 条日志
      const logs = sortedLogs.slice(-limit);
      
      res.json({ 
        success: true, 
        logs,
        count: logs.length,
        totalCount: result.data.runtimeLogs.length
      });
    } else {
      res.status(400).json({ error: '获取日志失败', details: result });
    }
  } catch (error) {
    res.status(500).json({ error: '获取日志失败: ' + error.message });
  }
});

// 重命名项目
app.post('/api/project/rename', requireAuth, async (req, res) => {
  const { accountId, projectId, newName } = req.body;
  
  console.log(`📝 收到重命名请求: accountId=${accountId}, projectId=${projectId}, newName=${newName}`);
  
  if (!accountId || !projectId || !newName) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  
  try {
    // 从服务器存储中获取账号token
    const serverAccounts = loadServerAccounts();
    const account = serverAccounts.find(acc => (acc.id || acc.name) === accountId);
    
    if (!account || !account.token) {
      return res.status(404).json({ error: '未找到账号或token' });
    }
    
    const mutation = `mutation { renameProject(_id: "${projectId}", name: "${newName}") }`;
    console.log(`🔍 发送 GraphQL mutation:`, mutation);
    
    const result = await queryZeabur(account.token, mutation);
    console.log(`📥 API 响应:`, JSON.stringify(result, null, 2));
    
    if (result.data?.renameProject) {
      console.log(`✅ 项目已重命名: ${newName}`);
      res.json({ success: true, message: '项目已重命名' });
    } else {
      console.log(`❌ 重命名失败:`, result);
      res.status(400).json({ error: '重命名失败', details: result });
    }
  } catch (error) {
    console.log(`❌ 异常:`, error);
    res.status(500).json({ error: '重命名项目失败: ' + error.message });
  }
});

// 获取当前版本
app.get('/api/version', (req, res) => {
  const packageJson = require('./package.json');
  res.json({ version: packageJson.version });
});

// 获取GitHub最新版本
app.get('/api/latest-version', async (req, res) => {
  try {
    const options = {
      hostname: 'raw.githubusercontent.com',
      path: '/jiujiu532/zeabur-monitor/main/package.json',
      method: 'GET',
      timeout: 5000
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        try {
          const packageJson = JSON.parse(data);
          res.json({ version: packageJson.version });
        } catch (e) {
          res.status(500).json({ error: '解析版本信息失败' });
        }
      });
    });

    request.on('error', (error) => {
      res.status(500).json({ error: '获取最新版本失败: ' + error.message });
    });

    request.on('timeout', () => {
      request.destroy();
      res.status(500).json({ error: '请求超时' });
    });

    request.end();
  } catch (error) {
    res.status(500).json({ error: '获取最新版本失败: ' + error.message });
  }
});

// Zeabur 控制台代理 - 完整代理方案
// 由于 Zeabur 是 SPA 应用，静态资源路径是绝对路径，代理会很复杂
// 改用更简单的方案：直接跳转到 Zeabur 并自动设置 cookie

// 登录跳转页面（不需要认证，因为需要在新窗口打开）
app.get('/dash/:accountName', (req, res) => {
  const accountName = decodeURIComponent(req.params.accountName);
  
  const serverAccounts = loadServerAccounts();
  const envAccounts = getEnvAccounts();
  const allAccounts = [...envAccounts, ...serverAccounts];
  const account = allAccounts.find(acc => acc.name === accountName);
  
  if (!account || !account.sessionToken) {
    return res.status(404).send(`
      <html>
      <head><title>错误</title></head>
      <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #1a1a2e; color: #fff;">
        <div style="text-align: center;">
          <h1 style="color: #f696c6;">❌ 账号不存在</h1>
          <p>账号 "${accountName}" 不存在或没有配置 Session Token</p>
          <a href="/" style="color: #f696c6;">返回首页</a>
        </div>
      </body>
      </html>
    `);
  }
  
  const token = account.sessionToken;
  const cookieCode = `document.cookie="token=${token};path=/;domain=.zeabur.com;max-age=31536000";location.reload();`;
  
  // 返回一个页面，自动复制代码并跳转
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>登录 Zeabur - ${accountName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { text-align: center; max-width: 500px; padding: 40px; }
        h1 { color: #f696c6; margin-bottom: 10px; font-size: 28px; }
        .account { color: #888; margin-bottom: 30px; }
        .step { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin: 15px 0; text-align: left; }
        .step-title { font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 10px; }
        .step-num { background: #f696c6; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .code-box { background: #0d1117; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 11px; word-break: break-all; margin-top: 10px; color: #7ee787; }
        .btn { background: linear-gradient(135deg, #f696c6, #fbb6d8); color: #fff; border: none; padding: 14px 28px; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 20px; transition: transform 0.2s; }
        .btn:hover { transform: translateY(-2px); }
        .copied { color: #7ee787; font-size: 14px; margin-top: 10px; }
        .auto-copy { background: #238636; color: #fff; padding: 8px 16px; border-radius: 6px; font-size: 13px; display: inline-block; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔑 Zeabur 登录</h1>
        <p class="account">${accountName}</p>
        
        <div class="auto-copy" id="status">⏳ 正在复制登录代码...</div>
        
        <div class="step">
          <div class="step-title"><span class="step-num">1</span> 打开 Zeabur 控制台</div>
          <p style="color: #888; font-size: 14px;">点击下方按钮打开 Zeabur</p>
        </div>
        
        <div class="step">
          <div class="step-title"><span class="step-num">2</span> 粘贴登录代码</div>
          <p style="color: #888; font-size: 14px;">按 F12 打开控制台，粘贴代码并回车</p>
          <div class="code-box">${cookieCode}</div>
        </div>
        
        <button class="btn" onclick="window.open('https://dash.zeabur.com', '_blank')">🚀 打开 Zeabur 控制台</button>
        
        <p id="copied" class="copied" style="display: none;">✅ 代码已复制到剪贴板</p>
      </div>
      
      <script>
        // 自动复制代码
        const code = '${cookieCode}';
        navigator.clipboard.writeText(code).then(() => {
          document.getElementById('status').innerHTML = '✅ 登录代码已复制到剪贴板';
          document.getElementById('status').style.background = '#238636';
          document.getElementById('copied').style.display = 'block';
        }).catch(() => {
          document.getElementById('status').innerHTML = '⚠️ 请手动复制下方代码';
          document.getElementById('status').style.background = '#f85149';
        });
      </script>
    </body>
    </html>
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✨ Zeabur Monitor 运行在 http://0.0.0.0:${PORT}`);
  
  // 显示加密状态
  if (ENCRYPTION_ENABLED) {
    console.log(`🔐 Token 加密存储: 已启用 (AES-256-GCM)`);
  } else {
    console.log(`⚠️  Token 加密存储: 未启用 (建议设置 ACCOUNTS_SECRET 环境变量)`);
  }
  
  const envAccounts = getEnvAccounts();
  const serverAccounts = loadServerAccounts();
  const totalAccounts = envAccounts.length + serverAccounts.length;
  
  if (totalAccounts > 0) {
    console.log(`📋 已加载 ${totalAccounts} 个账号`);
    if (envAccounts.length > 0) {
      console.log(`   环境变量: ${envAccounts.length} 个`);
      envAccounts.forEach(acc => console.log(`     - ${acc.name}`));
    }
    if (serverAccounts.length > 0) {
      console.log(`   服务器存储: ${serverAccounts.length} 个`);
      serverAccounts.forEach(acc => console.log(`     - ${acc.name}`));
    }
  } else {
    console.log(`📊 准备就绪，等待添加账号...`);
  }
});
