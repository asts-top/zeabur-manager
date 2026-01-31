#!/usr/bin/env python3
"""
Zeabur Session Token 批量刷新工具
使用浏览器自动化批量刷新即将过期的 Session Token
"""

import csv
import asyncio
import subprocess
import time
import sys
from datetime import datetime, timedelta
from playwright.async_api import async_playwright
from check_token_expiry import decode_jwt


def kill_existing_chrome():
    """关闭现有Chrome进程"""
    try:
        print("🔄 关闭现有Chrome进程...")
        subprocess.run(["taskkill", "/F", "/IM", "chrome.exe"], capture_output=True, shell=True)
        time.sleep(2)
    except:
        pass


def start_chrome_debug():
    """启动Chrome调试模式"""
    try:
        chrome_path = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        import tempfile
        temp_dir = tempfile.mkdtemp(prefix="chrome-zeabur-")
        
        cmd = [
            chrome_path,
            "--remote-debugging-port=9222",
            f"--user-data-dir={temp_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            "--start-maximized"
        ]

        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("🌐 Chrome已启动（调试模式）")
        time.sleep(3)
        return True
    except Exception as e:
        print(f"❌ Chrome启动失败: {e}")
        return False


async def get_new_token(page):
    """从页面获取新的 Session Token"""
    try:
        # 等待页面加载
        await asyncio.sleep(3)
        
        # 从 Cookie 中获取 token
        cookies = await page.context.cookies()
        for cookie in cookies:
            if cookie['name'] == 'token':
                return cookie['value']
        
        return None
    except Exception as e:
        print(f"⚠️ 获取 token 失败: {e}")
        return None


async def refresh_account_token(browser, account, use_cn=True):
    """刷新单个账号的 token"""
    email = account['email']
    old_token = account['token']
    
    print(f"\n{'='*60}")
    print(f"🔄 正在刷新: {email}")
    print(f"{'='*60}")
    
    # 选择域名
    if use_cn:
        base_domain = ".zeabur.cn"
        dash_url = "https://dash.zeabur.cn"
    else:
        base_domain = ".zeabur.com"
        dash_url = "https://dash.zeabur.com"
    
    context = await browser.new_context()
    page = await context.new_page()
    
    try:
        # 注入旧 token
        await context.add_cookies([{
            'name': 'token',
            'value': old_token,
            'domain': base_domain,
            'path': '/'
        }])
        
        # 访问控制台
        print(f"📡 访问 {dash_url}...")
        await page.goto(dash_url, timeout=30000)
        await asyncio.sleep(5)
        
        # 获取新 token
        new_token = await get_new_token(page)
        
        if new_token and new_token != old_token:
            print(f"✅ Token 已更新")
            print(f"   旧: {old_token[:30]}...")
            print(f"   新: {new_token[:30]}...")
            
            # 验证新 token 的过期时间
            exp_date = decode_jwt(new_token)
            if exp_date:
                days_left = (exp_date - datetime.now()).days
                print(f"   新过期时间: {exp_date.strftime('%Y-%m-%d')} (剩余 {days_left} 天)")
            
            return new_token
        elif new_token == old_token:
            print(f"ℹ️  Token 未变化（可能还未过期）")
            return old_token
        else:
            print(f"⚠️  未能获取新 token，可能需要重新登录")
            print(f"   请手动访问: {dash_url}")
            print(f"   按 Enter 继续...")
            input()
            
            # 再次尝试获取
            new_token = await get_new_token(page)
            if new_token:
                print(f"✅ 手动登录后获取到新 token")
                return new_token
            
            return None
        
    except Exception as e:
        print(f"❌ 刷新失败: {e}")
        return None
    finally:
        await context.close()


def load_accounts_need_refresh(csv_path="zeabur_accounts.csv", warning_days=7):
    """加载需要刷新的账号"""
    now = datetime.now()
    warning_date = now + timedelta(days=warning_days)
    
    accounts = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, 1):
            email = row.get('邮箱', '')
            token = row.get('Session Token', '')
            
            if not token:
                continue
            
            exp_date = decode_jwt(token)
            if exp_date and exp_date < warning_date:
                accounts.append({
                    'index': i,
                    'email': email,
                    'token': token,
                    'exp_date': exp_date,
                    'row': row
                })
    
    return accounts


def update_csv_tokens(csv_path, updated_tokens):
    """更新 CSV 文件中的 tokens"""
    # 读取所有行
    rows = []
    with open(csv_path, 'r', encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            email = row.get('邮箱', '')
            if email in updated_tokens:
                row['Session Token'] = updated_tokens[email]
            rows.append(row)
    
    # 写回文件
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"\n✅ CSV 文件已更新: {csv_path}")


async def main_async():
    print("=" * 60)
    print("  Zeabur Session Token 批量刷新工具")
    print("=" * 60)
    print()
    
    # 加载需要刷新的账号
    warning_days = 7
    accounts = load_accounts_need_refresh(warning_days=warning_days)
    
    if not accounts:
        print("✅ 没有需要刷新的账号！")
        return
    
    print(f"📋 找到 {len(accounts)} 个需要刷新的账号:")
    for acc in accounts:
        days_left = (acc['exp_date'] - datetime.now()).days
        status = "已过期" if days_left < 0 else f"剩余 {days_left} 天"
        print(f"   {acc['index']}. {acc['email']} ({status})")
    print()
    
    # 选择版本
    print("选择登录版本:")
    print("  1. zeabur.com (国际版)")
    print("  2. zeabur.cn (中国版)")
    version_choice = input("请选择 (1/2，默认1): ").strip()
    use_cn = version_choice == '2'
    
    print()
    print("开始刷新...")
    print()
    
    updated_tokens = {}
    
    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.connect_over_cdp("http://localhost:9222")
            
            for acc in accounts:
                try:
                    new_token = await refresh_account_token(browser, acc, use_cn)
                    if new_token and new_token != acc['token']:
                        updated_tokens[acc['email']] = new_token
                    
                    # 询问是否继续
                    if acc != accounts[-1]:
                        print(f"\n按 Enter 继续下一个账号，输入 'q' 退出...")
                        user_input = input().strip().lower()
                        if user_input == 'q':
                            break
                
                except Exception as e:
                    print(f"⚠️ 处理账号时出错: {e}")
                    continue
            
            await browser.close()
    
    except Exception as e:
        print(f"⚠️ 浏览器连接错误: {e}")
    
    # 更新 CSV
    if updated_tokens:
        print(f"\n{'='*60}")
        print(f"📝 成功刷新 {len(updated_tokens)} 个账号的 token")
        print(f"{'='*60}")
        for email in updated_tokens:
            print(f"   ✅ {email}")
        print()
        
        confirm = input("是否更新到 CSV 文件? (y/n): ").strip().lower()
        if confirm == 'y':
            update_csv_tokens("zeabur_accounts.csv", updated_tokens)
            
            # 同时更新 zeabur_env_v2.txt
            print("\n正在更新 zeabur_env_v2.txt...")
            update_env_file(updated_tokens)
        else:
            print("❌ 已取消更新")
    else:
        print("\n⚠️  没有成功刷新任何 token")


def update_env_file(updated_tokens):
    """更新 zeabur_env_v2.txt 文件"""
    try:
        # 读取 CSV 获取完整信息
        accounts_data = {}
        with open("zeabur_accounts.csv", 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                email = row.get('邮箱', '')
                accounts_data[email] = {
                    'api_key': row.get('API Key', ''),
                    'session_token': row.get('Session Token', '')
                }
        
        # 生成新的 ACCOUNTS 行
        accounts_list = []
        for email, data in accounts_data.items():
            if data['api_key'] and data['session_token']:
                accounts_list.append(f"{email}:{data['api_key']}:{data['session_token']}")
        
        accounts_str = ','.join(accounts_list)
        
        # 读取现有 env 文件
        env_lines = []
        if os.path.exists("zeabur_env_v2.txt"):
            with open("zeabur_env_v2.txt", 'r', encoding='utf-8') as f:
                env_lines = f.readlines()
        
        # 更新 ACCOUNTS 行
        updated = False
        for i, line in enumerate(env_lines):
            if line.startswith('ACCOUNTS='):
                env_lines[i] = f"ACCOUNTS={accounts_str}\n"
                updated = True
                break
        
        if not updated:
            env_lines.append(f"ACCOUNTS={accounts_str}\n")
        
        # 写回文件
        with open("zeabur_env_v2.txt", 'w', encoding='utf-8') as f:
            f.writelines(env_lines)
        
        print("✅ zeabur_env_v2.txt 已更新")
        
    except Exception as e:
        print(f"⚠️ 更新 env 文件失败: {e}")


def main():
    # 关闭现有Chrome
    kill_existing_chrome()
    
    # 启动Chrome调试模式
    if not start_chrome_debug():
        print("请手动启动Chrome后重试")
        sys.exit(1)
    
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        print("\n⏹️ 用户中断")
    except Exception as e:
        print(f"⚠️ 程序异常: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("\n🔄 清理Chrome进程...")
        kill_existing_chrome()
        print("✅ 程序已退出")


if __name__ == "__main__":
    main()
