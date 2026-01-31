#!/usr/bin/env python3
"""
Zeabur Session Token 过期检测工具
检测 CSV 中的 Session Token 是否即将过期，并生成需要更新的账号列表
"""

import csv
import json
import base64
from datetime import datetime, timedelta


def decode_jwt(token):
    """解码 JWT token 获取过期时间"""
    try:
        # JWT 格式: header.payload.signature
        parts = token.split('.')
        if len(parts) != 3:
            return None
        
        # 解码 payload (第二部分)
        payload = parts[1]
        # 添加padding
        padding = 4 - len(payload) % 4
        if padding != 4:
            payload += '=' * padding
        
        decoded = base64.urlsafe_b64decode(payload)
        data = json.loads(decoded)
        
        # 获取过期时间 (exp 字段，Unix 时间戳)
        if 'exp' in data:
            exp_timestamp = data['exp']
            exp_date = datetime.fromtimestamp(exp_timestamp)
            return exp_date
        elif 'iat' in data:
            # 如果没有 exp，使用 iat (issued at) + 90天估算
            iat_timestamp = data['iat']
            iat_date = datetime.fromtimestamp(iat_timestamp)
            exp_date = iat_date + timedelta(days=90)
            return exp_date
        
        return None
    except Exception as e:
        print(f"⚠️ 解码失败: {e}")
        return None


def check_tokens(csv_path="zeabur_accounts.csv", warning_days=7):
    """检查所有账号的 token 过期情况"""
    print("=" * 60)
    print("  Zeabur Session Token 过期检测")
    print("=" * 60)
    print()
    
    now = datetime.now()
    warning_date = now + timedelta(days=warning_days)
    
    expired = []
    expiring_soon = []
    valid = []
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, 1):
            email = row.get('邮箱', '')
            token = row.get('Session Token', '')
            
            if not token:
                continue
            
            exp_date = decode_jwt(token)
            
            if exp_date is None:
                print(f"⚠️  {i}. {email} - 无法解析过期时间")
                continue
            
            days_left = (exp_date - now).days
            
            if exp_date < now:
                expired.append({
                    'index': i,
                    'email': email,
                    'exp_date': exp_date,
                    'days_left': days_left
                })
            elif exp_date < warning_date:
                expiring_soon.append({
                    'index': i,
                    'email': email,
                    'exp_date': exp_date,
                    'days_left': days_left
                })
            else:
                valid.append({
                    'index': i,
                    'email': email,
                    'exp_date': exp_date,
                    'days_left': days_left
                })
    
    # 输出结果
    print(f"📊 统计:")
    print(f"   ✅ 有效: {len(valid)} 个")
    print(f"   ⚠️  即将过期 ({warning_days}天内): {len(expiring_soon)} 个")
    print(f"   ❌ 已过期: {len(expired)} 个")
    print()
    
    if expired:
        print("❌ 已过期的账号:")
        print("-" * 60)
        for acc in expired:
            print(f"   {acc['index']}. {acc['email']}")
            print(f"      过期时间: {acc['exp_date'].strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"      已过期: {abs(acc['days_left'])} 天")
            print()
    
    if expiring_soon:
        print(f"⚠️  即将过期的账号 ({warning_days}天内):")
        print("-" * 60)
        for acc in expiring_soon:
            print(f"   {acc['index']}. {acc['email']}")
            print(f"      过期时间: {acc['exp_date'].strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"      剩余: {acc['days_left']} 天")
            print()
    
    # 生成需要更新的账号列表
    need_update = expired + expiring_soon
    if need_update:
        print("=" * 60)
        print("📝 需要更新 Session Token 的账号:")
        print("=" * 60)
        for acc in need_update:
            print(f"{acc['email']}")
        print()
        print("💡 更新方法:")
        print("   1. 使用 browser_login.py 逐个登录查看")
        print("   2. 在浏览器中按 F12 → Application → Cookies")
        print("   3. 复制新的 token 值更新到 CSV")
        print()
    else:
        print("✅ 所有账号的 Session Token 都有效！")
        print()
    
    # 显示最早过期的5个账号
    if valid:
        print("📅 最早过期的 5 个账号:")
        print("-" * 60)
        sorted_valid = sorted(valid, key=lambda x: x['exp_date'])[:5]
        for acc in sorted_valid:
            print(f"   {acc['email']}")
            print(f"      过期时间: {acc['exp_date'].strftime('%Y-%m-%d')}")
            print(f"      剩余: {acc['days_left']} 天")
            print()


if __name__ == "__main__":
    import sys
    
    # 可以指定提前多少天警告
    warning_days = 7
    if len(sys.argv) > 1:
        try:
            warning_days = int(sys.argv[1])
        except:
            pass
    
    check_tokens(warning_days=warning_days)
