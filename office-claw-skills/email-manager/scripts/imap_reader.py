#!/usr/bin/env python3
"""
IMAP 邮件读取器
支持查看邮件列表、读取邮件内容、搜索邮件、标记邮件
"""

import argparse
import json
import os
import sys
import email
from email.header import decode_header
import imaplib
from datetime import datetime, timedelta


def load_config(config_path=None):
    """加载配置文件"""
    if config_path is None:
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.json')
    
    if not os.path.exists(config_path):
        config = {
            'imap_host': os.environ.get('IMAP_HOST', 'imap.qq.com'),
            'imap_port': int(os.environ.get('IMAP_PORT', 993)),
            'imap_user': os.environ.get('IMAP_USER', ''),
            'imap_pass': os.environ.get('IMAP_PASS', ''),
        }
    else:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
    
    return config


def decode_str(s):
    """解码邮件头字符串"""
    if s is None:
        return ''
    decoded = []
    for part, charset in decode_header(s):
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or 'utf-8', errors='replace'))
        else:
            decoded.append(part)
    return ''.join(decoded)


def get_email_body(msg):
    """提取邮件正文"""
    body = ''
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type == 'text/plain':
                try:
                    payload = part.get_payload(decode=True)
                    charset = part.get_content_charset() or 'utf-8'
                    body = payload.decode(charset, errors='replace')
                    break
                except:
                    pass
    else:
        try:
            payload = msg.get_payload(decode=True)
            charset = msg.get_content_charset() or 'utf-8'
            body = payload.decode(charset, errors='replace')
        except:
            pass
    return body


def connect_imap(config):
    """连接 IMAP 服务器"""
    mail = imaplib.IMAP4_SSL(config['imap_host'], config['imap_port'])
    mail.login(config['imap_user'], config['imap_pass'])
    return mail


def list_emails(limit=10, folder='INBOX', unread_only=False, config_path=None):
    """列出邮件"""
    config = load_config(config_path)
    
    if not config.get('imap_user') or not config.get('imap_pass'):
        raise ValueError("请先配置邮箱账号和授权码")
    
    mail = connect_imap(config)
    mail.select(folder)
    
    # 搜索邮件
    if unread_only:
        status, messages = mail.search(None, 'UNSEEN')
    else:
        status, messages = mail.search(None, 'ALL')
    
    email_ids = messages[0].split()
    email_ids = email_ids[-limit:]  # 取最新的 N 封
    
    results = []
    for email_id in reversed(email_ids):
        status, msg_data = mail.fetch(email_id, '(RFC822)')
        for response_part in msg_data:
            if isinstance(response_part, tuple):
                msg = email.message_from_bytes(response_part[1])
                
                subject = decode_str(msg.get('Subject'))
                from_ = decode_str(msg.get('From'))
                date = msg.get('Date')
                
                results.append({
                    'id': email_id.decode(),
                    'subject': subject,
                    'from': from_,
                    'date': date,
                })
    
    mail.close()
    mail.logout()
    
    return {'success': True, 'emails': results, 'count': len(results)}


def read_email(email_id, folder='INBOX', config_path=None):
    """读取邮件详情"""
    config = load_config(config_path)
    
    mail = connect_imap(config)
    mail.select(folder)
    
    status, msg_data = mail.fetch(email_id.encode(), '(RFC822)')
    
    result = {}
    for response_part in msg_data:
        if isinstance(response_part, tuple):
            msg = email.message_from_bytes(response_part[1])
            
            result = {
                'id': email_id,
                'subject': decode_str(msg.get('Subject')),
                'from': decode_str(msg.get('From')),
                'to': decode_str(msg.get('To')),
                'date': msg.get('Date'),
                'body': get_email_body(msg)[:5000],  # 限制长度
            }
    
    mail.close()
    mail.logout()
    
    return {'success': True, 'email': result}


def search_emails(query, folder='INBOX', limit=20, config_path=None):
    """搜索邮件"""
    config = load_config(config_path)
    
    mail = connect_imap(config)
    mail.select(folder)
    
    # 搜索主题或发件人包含关键词的邮件
    status, messages = mail.search(None, f'SUBJECT', f'"{query}"')
    email_ids = messages[0].split()
    
    if len(email_ids) < limit:
        # 也搜索发件人
        status, messages = mail.search(None, 'FROM', f'"{query}"')
        email_ids = list(set(email_ids + messages[0].split()))
    
    email_ids = email_ids[-limit:]
    
    results = []
    for email_id in reversed(email_ids):
        status, msg_data = mail.fetch(email_id, '(RFC822)')
        for response_part in msg_data:
            if isinstance(response_part, tuple):
                msg = email.message_from_bytes(response_part[1])
                results.append({
                    'id': email_id.decode(),
                    'subject': decode_str(msg.get('Subject')),
                    'from': decode_str(msg.get('From')),
                    'date': msg.get('Date'),
                })
    
    mail.close()
    mail.logout()
    
    return {'success': True, 'emails': results, 'count': len(results)}


def mark_email(email_id, action, folder='INBOX', config_path=None):
    """标记邮件"""
    config = load_config(config_path)
    
    mail = connect_imap(config)
    mail.select(folder)
    
    if action == 'read':
        mail.store(email_id.encode(), '+FLAGS', '\\Seen')
        message = '已标记为已读'
    elif action == 'unread':
        mail.store(email_id.encode(), '-FLAGS', '\\Seen')
        message = '已标记为未读'
    elif action == 'star':
        mail.store(email_id.encode(), '+FLAGS', '\\Flagged')
        message = '已标星'
    elif action == 'unstar':
        mail.store(email_id.encode(), '-FLAGS', '\\Flagged')
        message = '已取消标星'
    else:
        mail.close()
        mail.logout()
        return {'success': False, 'error': f'未知操作: {action}'}
    
    mail.close()
    mail.logout()
    
    return {'success': True, 'message': message}


def main():
    parser = argparse.ArgumentParser(description='IMAP 邮件读取器')
    subparsers = parser.add_subparsers(dest='command', help='子命令')
    
    # list 子命令
    list_parser = subparsers.add_parser('list', help='列出邮件')
    list_parser.add_argument('--limit', type=int, default=10, help='数量限制')
    list_parser.add_argument('--folder', default='INBOX', help='文件夹')
    list_parser.add_argument('--unread', action='store_true', help='仅未读')
    list_parser.add_argument('--config', help='配置文件路径')
    
    # read 子命令
    read_parser = subparsers.add_parser('read', help='读取邮件')
    read_parser.add_argument('--id', required=True, help='邮件ID')
    read_parser.add_argument('--folder', default='INBOX', help='文件夹')
    read_parser.add_argument('--config', help='配置文件路径')
    
    # search 子命令
    search_parser = subparsers.add_parser('search', help='搜索邮件')
    search_parser.add_argument('--query', required=True, help='搜索关键词')
    search_parser.add_argument('--folder', default='INBOX', help='文件夹')
    search_parser.add_argument('--limit', type=int, default=20, help='数量限制')
    search_parser.add_argument('--config', help='配置文件路径')
    
    # mark 子命令
    mark_parser = subparsers.add_parser('mark', help='标记邮件')
    mark_parser.add_argument('--id', required=True, help='邮件ID')
    mark_parser.add_argument('--action', required=True, choices=['read', 'unread', 'star', 'unstar'], help='操作')
    mark_parser.add_argument('--folder', default='INBOX', help='文件夹')
    mark_parser.add_argument('--config', help='配置文件路径')
    
    args = parser.parse_args()
    
    if args.command == 'list':
        result = list_emails(limit=args.limit, folder=args.folder, unread_only=args.unread, config_path=args.config)
    elif args.command == 'read':
        result = read_email(email_id=args.id, folder=args.folder, config_path=args.config)
    elif args.command == 'search':
        result = search_emails(query=args.query, folder=args.folder, limit=args.limit, config_path=args.config)
    elif args.command == 'mark':
        result = mark_email(email_id=args.id, action=args.action, folder=args.folder, config_path=args.config)
    else:
        parser.print_help()
        return
    
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()