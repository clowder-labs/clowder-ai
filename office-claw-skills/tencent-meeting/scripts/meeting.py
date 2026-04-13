#!/usr/bin/env python3
"""
腾讯会议 API 客户端
支持创建、查询、取消会议，以及录制和转写功能
纯 Python 实现，可在任何环境运行
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
import urllib.request
import urllib.error
import ssl

# API 配置
API_BASE = "https://mcp.meeting.tencent.com/mcp/wemeet-open/v1"
SKILL_VERSION = "v1.0.5"


def load_config(config_path=None):
    """加载配置"""
    if config_path is None:
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config.json')
    
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    # 从环境变量读取
    return {
        'token': os.environ.get('TENCENT_MEETING_TOKEN', '')
    }


def api_request(endpoint, data=None, config=None):
    """发送 API 请求"""
    if config is None:
        config = load_config()
    
    token = config.get('token', '')
    if not token:
        raise ValueError("请先配置 Token（config.json 或环境变量 TENCENT_MEETING_TOKEN）")
    
    url = f"{API_BASE}{endpoint}"
    headers = {
        'Content-Type': 'application/json',
        'X-Tencent-Meeting-Token': token,
        'X-Skill-Version': SKILL_VERSION
    }
    
    body = json.dumps(data).encode('utf-8') if data else b'{}'
    
    # 创建 SSL 上下文
    ctx = ssl.create_default_context()
    
    req = urllib.request.Request(url, data=body, headers=headers, method='POST')
    
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        raise Exception(f"API 错误 {e.code}: {error_body}")


def convert_timestamp(time_str=None):
    """时间转换工具"""
    if time_str:
        # 解析时间字符串
        dt = datetime.strptime(time_str, '%Y-%m-%d %H:%M')
        return int(dt.timestamp())
    else:
        # 返回当前时间
        return int(datetime.now().timestamp())


def create_meeting(subject, start_time, duration=60, config=None):
    """创建会议"""
    start_ts = convert_timestamp(start_time)
    end_ts = start_ts + duration * 60
    
    data = {
        'subject': subject,
        'start_time': str(start_ts),
        'end_time': str(end_ts),
        '_client_info': {
            'os': 'cross-platform',
            'agent': 'tencent-meeting-skill',
            'model': 'standalone'
        }
    }
    
    result = api_request('/schedule_meeting', data, config)
    
    if result.get('status_code') == 200:
        body = json.loads(result.get('body', '{}'))
        meeting = body.get('meeting_info_list', [{}])[0]
        return {
            'success': True,
            'meeting': {
                'subject': meeting.get('subject'),
                'meeting_code': meeting.get('meeting_code'),
                'join_url': meeting.get('join_url'),
                'start_time': start_time,
                'duration': duration
            }
        }
    else:
        return {'success': False, 'error': result}


def list_meetings(config=None):
    """查询会议列表"""
    result = api_request('/get_user_meetings', {}, config)
    
    if result.get('status_code') == 200:
        body = json.loads(result.get('body', '{}'))
        meetings = body.get('meeting_info_list', [])
        return {
            'success': True,
            'meetings': meetings,
            'count': len(meetings)
        }
    else:
        return {'success': False, 'error': result}


def get_meeting(meeting_id, config=None):
    """查询会议详情"""
    data = {'meeting_id': meeting_id}
    result = api_request('/get_meeting', data, config)
    
    if result.get('status_code') == 200:
        body = json.loads(result.get('body', '{}'))
        return {'success': True, 'meeting': body}
    else:
        return {'success': False, 'error': result}


def cancel_meeting(meeting_id, config=None):
    """取消会议"""
    data = {'meeting_id': meeting_id}
    result = api_request('/cancel_meeting', data, config)
    
    if result.get('status_code') == 200:
        return {'success': True, 'message': '会议已取消'}
    else:
        return {'success': False, 'error': result}


def get_recordings(meeting_id=None, config=None):
    """查询录制列表"""
    data = {}
    if meeting_id:
        data['meeting_id'] = meeting_id
    
    result = api_request('/get_records_list', data, config)
    
    if result.get('status_code') == 200:
        body = json.loads(result.get('body', '{}'))
        return {'success': True, 'recordings': body.get('records', [])}
    else:
        return {'success': False, 'error': result}


def get_transcript(record_file_id, config=None):
    """获取转写内容"""
    data = {'record_file_id': record_file_id}
    result = api_request('/get_transcripts_details', data, config)
    
    if result.get('status_code') == 200:
        body = json.loads(result.get('body', '{}'))
        return {'success': True, 'transcript': body}
    else:
        return {'success': False, 'error': result}


def main():
    parser = argparse.ArgumentParser(description='腾讯会议 API 客户端')
    subparsers = parser.add_subparsers(dest='command', help='子命令')
    
    # create 子命令
    create_parser = subparsers.add_parser('create', help='创建会议')
    create_parser.add_argument('--subject', required=True, help='会议主题')
    create_parser.add_argument('--start', required=True, help='开始时间 (YYYY-MM-DD HH:MM)')
    create_parser.add_argument('--duration', type=int, default=60, help='会议时长(分钟)')
    create_parser.add_argument('--config', help='配置文件路径')
    
    # list 子命令
    list_parser = subparsers.add_parser('list', help='查询会议列表')
    list_parser.add_argument('--config', help='配置文件路径')
    
    # get 子命令
    get_parser = subparsers.add_parser('get', help='查询会议详情')
    get_parser.add_argument('--meeting-id', required=True, help='会议ID')
    get_parser.add_argument('--config', help='配置文件路径')
    
    # cancel 子命令
    cancel_parser = subparsers.add_parser('cancel', help='取消会议')
    cancel_parser.add_argument('--meeting-id', required=True, help='会议ID')
    cancel_parser.add_argument('--config', help='配置文件路径')
    
    # recordings 子命令
    rec_parser = subparsers.add_parser('recordings', help='查询录制列表')
    rec_parser.add_argument('--meeting-id', help='会议ID')
    rec_parser.add_argument('--config', help='配置文件路径')
    
    # transcript 子命令
    trans_parser = subparsers.add_parser('transcript', help='获取转写内容')
    trans_parser.add_argument('--record-file-id', required=True, help='录制文件ID')
    trans_parser.add_argument('--config', help='配置文件路径')
    
    # convert 子命令
    conv_parser = subparsers.add_parser('convert', help='时间转换')
    conv_parser.add_argument('--time', help='时间字符串 (YYYY-MM-DD HH:MM)')
    
    args = parser.parse_args()
    
    config = load_config(getattr(args, 'config', None))
    
    if args.command == 'create':
        result = create_meeting(args.subject, args.start, args.duration, config)
    elif args.command == 'list':
        result = list_meetings(config)
    elif args.command == 'get':
        result = get_meeting(args.meeting_id, config)
    elif args.command == 'cancel':
        result = cancel_meeting(args.meeting_id, config)
    elif args.command == 'recordings':
        result = get_recordings(args.meeting_id, config)
    elif args.command == 'transcript':
        result = get_transcript(args.record_file_id, config)
    elif args.command == 'convert':
        ts = convert_timestamp(args.time)
        print(json.dumps({'timestamp': ts, 'time': args.time or 'now'}, ensure_ascii=False, indent=2))
        return
    else:
        parser.print_help()
        return
    
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()