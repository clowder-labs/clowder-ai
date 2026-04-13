#!/usr/bin/env python3
"""
飞书会议创建脚本

功能：调用飞书开放平台API创建在线会议
授权方式：OAuth 2.0
凭证从环境变量读取（具体变量名见代码）
"""

import os
import sys
import argparse
import json
from coze_workload_identity import requests


def create_meeting(title, start_time, duration, user_ids, description):
    """
    创建飞书会议

    Args:
        title: 会议主题（必需）
        start_time: 开始时间，ISO 8601格式（必需）
        duration: 会议时长，分钟（可选，默认60）
        user_ids: 参与人ID列表（可选）
        description: 会议描述（可选）

    Returns:
        dict: 包含会议链接和会议ID的字典
    """
    # 1. 获取OAuth凭证（凭证标识符从专用环境变量读取，避免硬编码）
    access_token = os.getenv("COZE_FEISHU_MEETING_TOKEN")

    if not access_token:
        raise ValueError(
            "缺少飞书OAuth凭证配置，请设置环境变量 COZE_FEISHU_MEETING_TOKEN"
        )

    # 2. 构建请求URL
    url = "https://open.feishu.cn/open-apis/vc/v1/meetings"

    # 3. 构建请求头
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    # 4. 构建请求体
    body = {
        "topic": title,
        "start_time": start_time,
        "end_time": calculate_end_time(start_time, duration)
    }

    # 可选参数
    if user_ids:
        body["user_ids"] = user_ids.split(",")

    if description:
        body["description"] = description

    # 5. 发起请求
    try:
        response = requests.post(
            url,
            headers=headers,
            json=body,
            timeout=30
        )

        # 检查HTTP状态码
        if response.status_code >= 400:
            raise Exception(
                f"HTTP请求失败: 状态码 {response.status_code}, "
                f"响应内容: {response.text}"
            )

        data = response.json()

        # 6. 飞书API错误处理
        code = data.get("code", 0)
        if code != 0:
            msg = data.get("msg", "未知错误")
            raise Exception(f"飞书接口错误[{code}]: {msg}")

        # 7. 提取会议信息
        meeting_data = data.get("data", {})
        meeting_url = meeting_data.get("meeting_url")
        meeting_id = meeting_data.get("meeting_id")

        if not meeting_url or not meeting_id:
            raise Exception("创建会议失败: 未获取到会议链接或会议ID")

        return {
            "success": True,
            "meeting_url": meeting_url,
            "meeting_id": meeting_id,
            "meeting_info": meeting_data
        }

    except requests.exceptions.RequestException as e:
        raise Exception(f"API调用失败: {str(e)}")


def calculate_end_time(start_time, duration):
    """
    计算结束时间

    Args:
        start_time: 开始时间，ISO 8601格式
        duration: 时长，分钟

    Returns:
        str: 结束时间，ISO 8601格式
    """
    from datetime import datetime, timedelta

    start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
    end_dt = start_dt + timedelta(minutes=duration)
    return end_dt.isoformat()


def main():
    """主函数：解析参数并调用创建会议"""
    parser = argparse.ArgumentParser(
        description="创建飞书会议",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  创建基础会议:
    python create_meeting.py --title "周例会" --start-time "2025-06-18T10:00:00+08:00"

  创建带参与人的会议:
    python create_meeting.py --title "产品评审" --start-time "2025-06-18T14:00:00+08:00" --duration 120 --user-ids "ou_xxx,ou_yyy"
        """
    )

    parser.add_argument(
        "--title",
        required=True,
        help="会议主题（必需）"
    )
    parser.add_argument(
        "--start-time",
        required=True,
        help="开始时间，ISO 8601格式，例如：2025-06-18T14:00:00+08:00（必需）"
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=60,
        help="会议时长，分钟（可选，默认60）"
    )
    parser.add_argument(
        "--user-ids",
        help="参与人ID列表，逗号分隔，例如：ou_xxx,ou_yyy（可选）"
    )
    parser.add_argument(
        "--description",
        help="会议描述（可选）"
    )

    args = parser.parse_args()

    try:
        # 调用创建会议
        result = create_meeting(
            title=args.title,
            start_time=args.start_time,
            duration=args.duration,
            user_ids=args.user_ids,
            description=args.description
        )

        # 输出结果（JSON格式）
        print(json.dumps(result, ensure_ascii=False, indent=2))

        return 0

    except ValueError as e:
        print(f"参数错误: {str(e)}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"创建会议失败: {str(e)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
