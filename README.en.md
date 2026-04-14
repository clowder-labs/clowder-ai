<div align="center">

# Clowder AI

**Multi-Agent Collaboration Platform — Let AI Teams Work for You**

![Logo](packaging/windows/assets/OfficeClaw.svg)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9+-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

[简体中文](README.md) | **English**

</div>

---

## Introduction

Clowder AI is a multi-agent collaboration platform that organizes multiple AI Agents into a real team. The core engine **JiuwenClaw** is built with Python, extending large model capabilities to everyday communication apps.

Supports various models from Huawei Cloud MaaS platform, enabling collaborative development, code review, and task management through a unified interface.

> **Most frameworks help you call Agents, Clowder helps them work together.**

## Quick Start

**Prerequisites:** Node.js 20+, pnpm 9+, Git

```bash
# 1. Clone
git clone https://github.com/your-org/clowder-ai.git
cd clowder-ai

# 2. Install dependencies
pnpm install

# 3. Build
pnpm build

# 4. Configure
cp .env.example .env
# Edit .env, configure Huawei Cloud MaaS API Key

# 5. Start
pnpm start
```

Open http://localhost:3003 to get started.

## Architecture

JiuwenClaw is the platform's core engine, built with Python:

**Core Capabilities:**

| Module | Description |
|--------|-------------|
| **Skills System** | Load skill packs on demand (TDD, debugging, review, etc.) |
| **Channels System** | Multi-platform access via Web, Xiaoyi, Feishu, etc. |
| **Memory System** | Session memory, long-term memory, cross-session knowledge persistence |
| **Browser Automation** | Automate web operations, extend Agent capabilities |
| **Task Planning** | Break down complex tasks, auto-orchestrate execution steps |
| **Scheduled Tasks** | Cron-based scheduling, auto-execute planned operations |

**Ecosystem Compatibility:**
- Supports various models on Huawei Cloud MaaS
- Native integration with Xiaoyi Open Platform
- Self-hosted, full data sovereignty

## Features

### Home Interface

![Home](docs/assets/home.png)

Multi-agent chat with @mention routing, thread isolation, and rich card replies.

### Model Management

![Models](docs/assets/models.png)

Configure and manage Huawei Cloud MaaS models, support multi-model switching.

### Agent Management

![Agents](docs/assets/agents.png)

Configure agent roles, skills, and collaboration strategies.

### Skills System

![Skills](docs/assets/skills.png)

Dynamically load skill packs to extend Agent capabilities on demand.

### Channels Management

![Channels](docs/assets/channels.png)

Configure multi-channel access including Feishu, Xiaoyi, etc.

### Scheduled Tasks

![Scheduled Tasks](docs/assets/scheduled-tasks.png)

Create and manage scheduled tasks for automated operations.

### Runtime Status

![Runtime Status](docs/assets/runtime-status.png)

Real-time monitoring of agent runtime status and resource usage.

## Contributing

Contributions welcome! Please follow this workflow:

1. Fork this repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push branch (`git push origin feature/amazing-feature`)
5. Create Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

This project is open-sourced under [MIT License](LICENSE).

Free to use, modify, and distribute. Please retain the copyright notice.

---

<p align="center">
  <em>Build AI teams, not just Agents.</em>
</p>