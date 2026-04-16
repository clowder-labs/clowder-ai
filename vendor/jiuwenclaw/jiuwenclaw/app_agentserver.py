"""AgentServer-only startup entry for RelayClaw sidecar."""

from __future__ import annotations

import asyncio
import os

from jiuwenclaw.app import logger


async def _run() -> None:
    from jiuwenclaw.agentserver.agent_ws_server import AgentWebSocketServer
    from jiuwenclaw.agentserver.interface import JiuWenClaw

    agent_port = int(os.getenv("AGENT_PORT", "18092"))
    logger.info("[AgentServer] 启动流程开始 AGENT_PORT=%s", agent_port)
    logger.info(
        "[App] 当前入口仅启动 AgentWebSocketServer，不再启动 Gateway/WebChannel/Heartbeat/Cron 调度"
    )
    agent = JiuWenClaw()
    logger.info("[AgentServer] JiuWenClaw 实例已创建，准备执行 agent.create_instance()")
    try:
        await agent.create_instance()
        logger.info("[AgentServer] agent.create_instance() 已返回")
        logger.info("[AgentServer] 即将启动 AgentWebSocketServer")
        server = AgentWebSocketServer.get_instance(
            agent=agent,
            host="127.0.0.1",
            port=agent_port,
            ping_interval=None,
            ping_timeout=None,
        )
        await server.start()
        logger.info("[AgentServer] AgentWebSocketServer 已监听: ws://127.0.0.1:%s", agent_port)
        logger.info("[App] AgentServer-only 已启动。Ctrl+C 退出。")
        await asyncio.Event().wait()
    except asyncio.CancelledError:
        pass
    finally:
        try:
            server
        except UnboundLocalError:
            pass
        else:
            logger.info("[AgentServer] 正在停止 AgentWebSocketServer …")
            await server.stop()
        logger.info("[App] AgentServer-only 已停止")


def main() -> None:
    logger.info("[App] process bootstrap pid=%s cwd=%s", os.getpid(), os.getcwd())
    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        logger.info("[App] KeyboardInterrupt pid=%s", os.getpid())
        raise
    except Exception:
        logger.critical("[App] asyncio.run(_run) failed pid=%s", os.getpid(), exc_info=True)
        raise


if __name__ == "__main__":
    main()
