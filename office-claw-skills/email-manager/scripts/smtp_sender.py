#!/usr/bin/env python3
"""
SMTP 邮件发送器
支持发送纯文本、HTML 邮件和带附件的邮件
"""

import argparse
import json
import os
import sys
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders


def load_config(config_path=None):
    """加载配置文件"""
    if config_path is None:
        # 默认从当前目录的 .env 或 config.json 加载
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.json')
    
    if not os.path.exists(config_path):
        # 尝试从环境变量读取
        config = {
            'smtp_host': os.environ.get('SMTP_HOST', 'smtp.qq.com'),
            'smtp_port': int(os.environ.get('SMTP_PORT', 587)),
            'smtp_user': os.environ.get('SMTP_USER', ''),
            'smtp_pass': os.environ.get('SMTP_PASS', ''),
            'smtp_from': os.environ.get('SMTP_FROM', os.environ.get('SMTP_USER', '')),
        }
    else:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
    
    return config


def send_email(to, subject, body, html=False, attachments=None, cc=None, bcc=None, config_path=None):
    """发送邮件"""
    config = load_config(config_path)
    
    if not config.get('smtp_user') or not config.get('smtp_pass'):
        raise ValueError("请先配置邮箱账号和授权码")
    
    # 创建邮件
    msg = MIMEMultipart('alternative')
    msg['From'] = config.get('smtp_from', config['smtp_user'])
    msg['To'] = to
    msg['Subject'] = subject
    
    if cc:
        msg['Cc'] = cc
    if bcc:
        msg['Bcc'] = bcc
    
    # 添加正文
    if html:
        msg.attach(MIMEText(body, 'html', 'utf-8'))
    else:
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
    
    # 添加附件
    if attachments:
        for file_path in attachments:
            if os.path.exists(file_path):
                with open(file_path, 'rb') as f:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(f.read())
                encoders.encode_base64(part)
                part.add_header('Content-Disposition', f'attachment; filename={os.path.basename(file_path)}')
                msg.attach(part)
    
    # 发送邮件
    try:
        server = smtplib.SMTP(config['smtp_host'], config['smtp_port'], timeout=30)
        server.starttls()
        server.login(config['smtp_user'], config['smtp_pass'])
        
        recipients = [to]
        if cc:
            recipients.extend(cc.split(','))
        if bcc:
            recipients.extend(bcc.split(','))
        
        server.sendmail(config['smtp_user'], recipients, msg.as_string())
        server.quit()
        
        return {'success': True, 'message': '邮件发送成功'}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def main():
    parser = argparse.ArgumentParser(description='SMTP 邮件发送器')
    subparsers = parser.add_subparsers(dest='command', help='子命令')
    
    # send 子命令
    send_parser = subparsers.add_parser('send', help='发送邮件')
    send_parser.add_argument('--to', required=True, help='收件人')
    send_parser.add_argument('--subject', required=True, help='邮件主题')
    send_parser.add_argument('--body', required=True, help='邮件正文')
    send_parser.add_argument('--html', action='store_true', help='HTML 格式')
    send_parser.add_argument('--attach', action='append', help='附件路径')
    send_parser.add_argument('--cc', help='抄送')
    send_parser.add_argument('--bcc', help='密送')
    send_parser.add_argument('--config', help='配置文件路径')
    
    # test 子命令
    test_parser = subparsers.add_parser('test', help='测试连接')
    test_parser.add_argument('--config', help='配置文件路径')
    
    args = parser.parse_args()
    
    if args.command == 'send':
        result = send_email(
            to=args.to,
            subject=args.subject,
            body=args.body,
            html=args.html,
            attachments=args.attach,
            cc=args.cc,
            bcc=args.bcc,
            config_path=args.config
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0 if result['success'] else 1)
    
    elif args.command == 'test':
        config = load_config(args.config)
        try:
            server = smtplib.SMTP(config['smtp_host'], config['smtp_port'], timeout=30)
            server.starttls()
            server.login(config['smtp_user'], config['smtp_pass'])
            server.quit()
            print(json.dumps({'success': True, 'message': 'SMTP 连接成功'}, ensure_ascii=False, indent=2))
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}, ensure_ascii=False, indent=2))
            sys.exit(1)
    
    else:
        parser.print_help()


if __name__ == '__main__':
    main()