<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-blue?style=flat-square&logo=python" />
  <img src="https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/FastAPI-0.116-009688?style=flat-square&logo=fastapi" />
  <img src="https://img.shields.io/badge/LLM-GPT%20%7C%20Claude%20%7C%20GLM-blueviolet?style=flat-square" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" />
</p>

# PaperLens

> Your personal research lens — 根据你的兴趣，自动发现、阅读、总结学术论文。

PaperLens 是一个 AI 驱动的个性化学术论文追踪平台。

**致谢**：本项目基于 [PaperMind](https://github.com/Color2333/PaperMind) 开发，感谢 [Color2333](https://github.com/Color2333) 的开源贡献。

订阅你感兴趣的研究方向，系统自动从 arXiv 抓取最新论文，用 LLM 进行结构化粗读与精读，生成每日简报，并基于你的收藏行为持续发现新的兴趣方向。

---

## Highlights

- **兴趣驱动** — 收藏论文后，LLM 自动分析你的偏好，推荐新主题订阅
- **结构化摘要** — 粗读提取问题/方法/实验/结论，精读解析模型架构/伪代码/消融实验
- **多源聚合** — arXiv 定时抓取 + HuggingFace 热榜 + 手动导入
- **知识图谱** — 引用网络、相似度地图、研究前沿、跨主题桥梁
- **AI 助手** — 多轮对话问答、推理链分析、RAG 检索增强
- **笔记系统** — 论文高亮 + 自由笔记，按主题自动汇总
- **每日简报** — 自动生成研究日报，支持邮件推送
- **成本可控** — 内置成本守卫、每日预算、Token 用量追踪

---

## 架构概览

```
PaperLens/
├── apps/
│   ├── api/              # FastAPI 后端（REST + SSE 流式）
│   │   └── routers/      # 12 个路由模块，100+ 端点
│   └── worker/           # APScheduler 定时调度
├── packages/
│   ├── ai/               # 24 个 AI 模块：管线、推荐、RAG、Agent...
│   ├── domain/           # Pydantic 数据模型
│   ├── integrations/     # arXiv / HuggingFace / Semantic Scholar / LLM
│   └── storage/          # SQLAlchemy ORM + Repository 层
├── frontend/             # React 18 + Vite + Tailwind
├── scripts/              # 种子脚本、开发工具
└── pyproject.toml
```

---

## 核心功能

### 1. 个性化主题订阅

自定义 arXiv 搜索语法，系统按计划自动抓取新论文：

```python
# scripts/seed_topics.py — 示例主题
TOPICS = [
    {"name": "Reinforcement Learning", "query": "abs:reinforcement AND abs:learning"},
    {"name": "LLM Agent",              "query": "abs:agent AND (abs:language OR abs:LLM)"},
    {"name": "World Models",           "query": "abs:world AND abs:model AND (abs:learning OR abs:planning)"},
]
```

也可在前端 Topics 页面直接创建，或让 AI 根据你的自然语言描述自动生成 arXiv 查询语法。

### 2. 结构化论文分析

**粗读 (Skim)**：问题定义 / 方法概述 / 核心贡献 / 实验基准 / 结果总结 / 结论

**精读 (Deep Read)**：下载 PDF → MinerU/PyMuPDF 解析 → LLM 提取：
- 模型架构与关键图示
- 伪代码 / 算法流程
- 实验设置与主要结果
- 消融实验分析
- 与现有方法对比
- 局限性与未来方向

### 3. 兴趣发现与推荐

基于收藏论文的个性化推荐闭环：

```
收藏论文 → LLM 分析兴趣空白 → 推荐新主题 → arXiv 预览搜索 → 一键订阅
```

- 系统每日自动检测新收藏，有 3+ 篇新收藏时触发分析
- Dashboard 和论文页侧栏均可查看推荐、手动触发分析
- 基于 embedding 的相似论文推荐 + 热词趋势检测

### 4. 知识图谱与引用分析

- **引用网络** — Semantic Scholar + OpenAlex 数据构建引用树
- **相似度地图** — UMAP 降维的论文 embedding 可视化
- **研究前沿** — 识别高被引新论文和新兴方向
- **跨主题桥梁** — 发现连接不同主题的关键论文
- **共被引聚类** — 发现研究社区结构

### 5. AI Agent 对话

内置多工具 Agent，支持：
- 搜索和收集论文
- 粗读 / 精读 / 对比分析
- RAG 检索增强问答
- 推理链分析

### 6. 笔记与标注

- PDF 阅读时选中文字 → 保存到笔记本（附页码和原文）
- 为每篇论文写自由笔记（想法、灵感）
- 按主题聚合所有论文笔记，一目了然

### 7. 每日简报 & 邮件推送

每天自动生成研究简报，包含：新论文概览、推荐阅读、热词趋势。支持 SMTP 邮件推送至指定邮箱。

### 8. 学术写作助手

论文表达润色、AI 翻译、多模态（图片+文字）辅助写作。

---

## 快速开始

### 环境要求

- Python >= 3.11
- Node.js >= 18（前端）
- 至少一个 LLM API Key（OpenAI / Anthropic / 智谱）

### 1. 克隆与安装

```bash
git clone https://github.com/Qiushui-Xu/PaperLens.git && cd PaperLens

# 创建虚拟环境
python -m venv .venv && source .venv/bin/activate

# 安装依赖（含 LLM 和 PDF 支持）
pip install -e ".[llm,pdf]"
```

或使用一键脚本：

```bash
python scripts/dev_setup.py
```

### 2. 配置

```bash
cp .env.example .env
```

编辑 `.env`，**至少填写一个 LLM API Key**：

| 变量 | 说明 | 示例 |
|:-----|:-----|:-----|
| `LLM_PROVIDER` | LLM 提供商 | `openai` / `anthropic` / `zhipu` |
| `OPENAI_API_KEY` | OpenAI Key | `sk-proj-...` |
| `ZHIPU_API_KEY` | 智谱 Key（推荐，经济实惠） | — |
| `DATABASE_URL` | 数据库 | `sqlite:///./data/papermind.db` |

<details>
<summary>完整环境变量参考</summary>

| 变量 | 说明 | 默认值 |
|:-----|:-----|:------:|
| `LLM_MODEL_SKIM` | 粗读模型 | `glm-4.7` |
| `LLM_MODEL_DEEP` | 精读模型 | `glm-4.7` |
| `LLM_MODEL_VISION` | 视觉模型 | `glm-4.6v` |
| `EMBEDDING_MODEL` | 嵌入模型 | `embedding-3` |
| `COST_GUARD_ENABLED` | 成本守卫 | `true` |
| `DAILY_BUDGET_USD` | 每日预算 | `2.0` |
| `AUTH_PASSWORD` | 站点密码（空=公开） | — |
| `DAILY_CRON` | 简报时间 (UTC) | `0 4 * * *` |
| `DEFAULT_TOPIC_TIME_UTC` | 默认抓取时间 | `2` |
| `IDLE_PROCESSOR_ENABLED` | 闲时自动处理 | `true` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | 邮件推送 | — |

</details>

### 3. 初始化数据库

```bash
python scripts/local_bootstrap.py
```

### 4. 种子主题

```bash
python scripts/seed_topics.py
```

编辑脚本中的 `TOPICS` 列表来定义你的研究方向（upsert 逻辑，可反复运行）。

### 5. 启动

```bash
# 终端 1：API 服务
uvicorn apps.api.main:app --reload --port 8000

# 终端 2：Worker 调度器
python -m apps.worker.main

# 终端 3：前端（可选）
cd frontend && npm install && npm run dev
```

- API 文档：http://localhost:8000/docs
- 前端：http://localhost:5173

### Docker 部署

```bash
cp .env.example .env   # 编辑填入 API Key
docker compose up -d --build
# 前端: http://localhost:3002 | API: http://localhost:8002
```

---

## 调度时间表

Worker 自动执行以下定时任务（UTC 时间）：

| 任务 | 时间 (UTC) | 说明 |
|:-----|:-----------|:-----|
| 主题论文抓取 | 每小时整点 | 检查哪些主题该抓取，执行 arXiv 搜索 + HF 热榜 |
| 每日简报 | 04:00 | 生成研究简报，可选邮件推送 |
| 兴趣分析 | 06:00 | 检查新收藏，LLM 分析兴趣推荐主题 |
| 图谱维护 | 周日 22:00 | 引用同步、图谱更新 |
| 闲时处理 | 全天 | CPU 空闲时自动批量粗读+嵌入未处理论文 |

---

## 技术栈

| 层 | 技术 |
|:---|:-----|
| 后端 | FastAPI, SQLAlchemy 2, Pydantic, APScheduler |
| 前端 | React 18, Vite, Tailwind CSS, Lucide Icons |
| 数据库 | SQLite（开箱即用）|
| LLM | OpenAI / Anthropic / 智谱（可切换） |
| PDF 解析 | MinerU + PyMuPDF |
| 引用数据 | Semantic Scholar, OpenAlex |
| 可视化 | react-force-graph-2d, UMAP |
| 认证 | JWT (python-jose) |
| 部署 | Docker Compose |

---

## 项目结构

<details>
<summary>展开查看</summary>

```
PaperLens/
├── apps/
│   ├── api/
│   │   ├── main.py                 # FastAPI 入口
│   │   ├── deps.py                 # 依赖注入
│   │   └── routers/
│   │       ├── papers.py           # 论文 CRUD、AI 解读、图表分析
│   │       ├── topics.py           # 主题订阅管理
│   │       ├── content.py          # Wiki、简报、趋势、兴趣发现
│   │       ├── graph.py            # 知识图谱、引用分析
│   │       ├── agent.py            # AI Agent 对话
│   │       ├── pipelines.py        # 粗读/精读/嵌入管线
│   │       ├── rag.py              # RAG 问答
│   │       ├── notes.py            # 笔记系统
│   │       ├── settings.py         # LLM/邮件设置
│   │       ├── writing.py          # 写作助手
│   │       ├── jobs.py             # 手动触发任务
│   │       └── auth.py             # 认证
│   └── worker/
│       └── main.py                 # 定时任务调度
├── packages/
│   ├── ai/
│   │   ├── pipelines.py            # 核心管线（摄入/粗读/精读/嵌入）
│   │   ├── interest_analyzer.py    # 兴趣发现服务
│   │   ├── recommendation_service.py  # 推荐 + 趋势
│   │   ├── rag_service.py          # RAG 检索
│   │   ├── agent_service.py        # AI Agent
│   │   ├── graph_service.py        # 图谱分析
│   │   ├── brief_service.py        # 每日简报
│   │   ├── reasoning_service.py    # 推理链
│   │   ├── vision_reader.py        # MinerU PDF 解析
│   │   ├── writing_service.py      # 写作助手
│   │   └── ...
│   ├── integrations/
│   │   ├── arxiv_client.py         # arXiv API
│   │   ├── llm_client.py           # 多厂商 LLM 客户端
│   │   ├── hf_trending_client.py   # HuggingFace 热榜
│   │   ├── semantic_scholar_client.py
│   │   └── email_service.py        # 邮件推送
│   ├── storage/
│   │   ├── models.py               # 18 个 ORM 模型
│   │   ├── repositories.py         # Repository 层
│   │   └── db.py                   # 数据库初始化 + 迁移
│   └── domain/
│       └── schemas.py              # Pydantic schemas
├── frontend/
│   └── src/
│       ├── pages/                  # 16 个页面
│       ├── components/             # UI 组件库
│       └── services/api.ts         # API 客户端
├── scripts/
│   ├── seed_topics.py              # 种子主题
│   ├── dev_setup.py                # 一键初始化
│   └── local_bootstrap.py          # 数据库初始化
└── pyproject.toml
```

</details>

---

## 常用操作

### 手动触发抓取

```bash
curl http://localhost:8000/topics                        # 查看所有主题
curl -X POST http://localhost:8000/topics/<id>/fetch     # 触发指定主题
```

### 通过 API 管理主题

```bash
# 创建
curl -X POST http://localhost:8000/topics \
  -H "Content-Type: application/json" \
  -d '{"name": "Diffusion Models", "query": "abs:diffusion AND abs:model"}'

# 更新
curl -X PATCH http://localhost:8000/topics/<id> \
  -H "Content-Type: application/json" \
  -d '{"max_results_per_run": 20}'

# 删除
curl -X DELETE http://localhost:8000/topics/<id>
```

### 手动触发兴趣分析

```bash
curl -X POST http://localhost:8000/interests/analyze     # 启动分析
curl http://localhost:8000/interests/suggestions          # 查看结果
```

---

## License

[MIT](LICENSE)
