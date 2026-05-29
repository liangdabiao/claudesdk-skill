❯ 那么如果是部署到 vps 、宝塔 应该是怎样的流程，详细告诉我流程

● 先确认一下服务端口和配置。

  Searched for 1 pattern, read 4 files (ctrl+o to expand)

● 好的，完整流程如下：

  ---
  VPS + 宝塔部署 Amazon-Chat

  架构

  用户浏览器 → Nginx(宝塔, 80/443) → Node.js(PM2, 3005端口)
                                            │
                                      Express + WebSocket
                                      + 静态前端 + API

  Express 已内置静态文件服务和所有路由，Nginx 只做反向代理 + SSL。

  ---
  Step 1: VPS 基础环境

  # 安装宝塔（如果还没装）
  curl -sSO https://raw.githubusercontent.com/zhucaidan/btpanel-v7.7.0/main/install/install_panel.sh && bash
  install_panel.sh

  # 安装 Node.js 18+（用 nvm）
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
  source ~/.bashrc
  nvm install 18
  nvm use 18

  # 安装 Python3 + 依赖
  apt install -y python3 python3-pip
  pip3 install requests openpyxl

  Step 2: 上传项目

  方式 A：Git 克隆（推荐）
  cd /www/wwwroot
  git clone <你的仓库地址> amazon-chat
  cd amazon-chat

  方式 B：宝塔面板上传
  - 宝塔 → 文件 → 进入 /www/wwwroot/
  - 上传项目 zip → 解压

  Step 3: 配置 .env

  cd /www/wwwroot/amazon-chat
  cat > .env << 'EOF'
  ANTHROPIC_API_KEY=sk-你的key
  ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
  MODEL=deepseek-v4-flash
  TIKHUB_TOKEN=你的Sorftime-Key
  PORT=3005
  EOF

  Step 4: 生成 .mcp.json

  cd /www/wwwroot/amazon-chat
  cat > .mcp.json << 'EOF'
  {
    "mcpServers": {
      "sorftime": {
        "url": "https://mcp.sorftime.com?key=你的TIKHUB_TOKEN"
      }
    }
  }
  EOF

  Step 5: 安装依赖 + 构建

  cd /www/wwwroot/amazon-chat
  npm install
  npm run build

  构建完成后 dist/ 目录包含前端静态文件和编译后的服务端代码。

  Step 6: 测试运行

  node dist/server/index.js

  看到 AmazonChat Server listening on :3005 就成功了。Ctrl+C 停止。

  Step 7: PM2 守护进程

  # 安装 PM2
  npm install -g pm2

  # 启动服务
  cd /www/wwwroot/amazon-chat
  pm2 start dist/server/index.js --name amazon-chat

  # 查看状态
  pm2 status

  # 查看日志
  pm2 logs amazon-chat

  # 设置开机自启
  pm2 save
  pm2 startup

  Step 8: 宝塔 Nginx 反向代理

  1. 宝塔面板 → 网站 → 添加站点
  2. 填入你的域名（如 chat.example.com）
  3. 不需要创建数据库和 FTP
  4. 点击站点名 → 反向代理 → 添加反向代理：
    - 代理名称：amazon-chat
    - 目标URL：http://127.0.0.1:3005
  5. 然后点 配置文件，替换为：

  location / {
      proxy_pass http://127.0.0.1:3005;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
  }

  # WebSocket 支持
  location /ws {
      proxy_pass http://127.0.0.1:3005;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_read_timeout 86400;
  }

  Step 9: SSL（可选但推荐）

  宝塔面板 → 网站 → 你的站点 → SSL：
  - 选择 Let's Encrypt → 免费申请
  - 或上传自己的证书
  - 开启 强制 HTTPS

  Step 10: 验证

  1. 访问 https://chat.example.com
  2. 右上角应显示绿色"已连接"
  3. 发送测试消息
  4. 测试技能：/amazon-analyse B07PWTJ4H1 US

  ---
  更新部署

  cd /www/wwwroot/amazon-chat
  git pull                    # 拉取最新代码
  npm install                 # 更新依赖（如有变化）
  npm run build               # 重新构建
  pm2 restart amazon-chat     # 重启服务

  ---
  常用运维命令

  pm2 logs amazon-chat        # 查看日志
  pm2 restart amazon-chat     # 重启
  pm2 stop amazon-chat        # 停止
  pm2 monit                   # 监控 CPU/内存
