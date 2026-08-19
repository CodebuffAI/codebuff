# Freebuff

[English](./README.md) | 简体中文

**面向编程、构建和研究的五款免费 AI 产品。** 无需订阅、积分或 API 密钥。

[Freebuff](https://freebuff.com) 将专业化智能体和多种领先模型带到你的终端、桌面、浏览器和 GitHub 仓库中。内置模型由文字广告支持。

## 选择适合你的 Freebuff

| 产品                 | 功能                         | 开始使用                                                        |
| -------------------- | ---------------------------- | --------------------------------------------------------------- |
| **Freebuff Desktop** | 在本地并行运行多个智能体     | [下载 macOS、Windows 或 Linux 版](https://freebuff.com/desktop) |
| **Freebuff CLI**     | 从终端编程                   | [安装 CLI](https://freebuff.com/cli)                            |
| **Freebuff Web**     | 构建和发布全栈应用           | [构建应用](https://freebuff.com/web)                            |
| **Freebuff Cloud**   | 在任意 GitHub 仓库运行智能体 | [连接仓库](https://freebuff.com/cloud)                          |
| **Freebuff Chat**    | 使用 AI 进行研究和思考       | [开始对话](https://freebuff.com/chat)                           |

## 快速开始

在任意项目中从终端运行 Freebuff：

```bash
npm install -g freebuff
cd ~/my-project
freebuff
```

然后描述你想完成的任务。Freebuff 会找到相关文件、进行修改，并运行适合该项目的检查。

## 模型

Freebuff 提供经过筛选的模型目录。常规模型选择器目前包括：

| 模型                        | 访问范围       | 适用场景                                         |
| --------------------------- | -------------- | ------------------------------------------------ |
| **GPT-5.6 Luna**            | 完整访问       | 深度推理，原生支持图像                           |
| **DeepSeek V4 Flash 07/31** | 完整访问       | 完整模式下所有平台的默认模型；快速编程和工具调用 |
| **MiniMax M3**              | 完整访问       | 快速响应并支持图像                               |
| **MiMo 2.5**                | 完整和受限访问 | 受限模式的默认模型；均衡性能并支持图像           |
| **DeepSeek V4 Pro**         | 完整访问       | 推理最深入；成本最高，因此不作为默认模型         |

由于上游价格上涨，有两项**临时**调整：V4 Flash 需要占用高级会话，不再是无限使用；DeepSeek 模型可能由量化（Q8_0）版本提供服务以降低成本。在此期间 MiMo 2.5 为无限使用模型。这两项调整都计划在之后恢复。

常规模型选择器之外：

- **GLM 5.2** 通过获得的会话使用，并非始终解锁。
- **Gemini 3.1 Flash Lite** 用于查找文件和研究等专业任务，不会出现在主模型选择器中。

可用模型和限制取决于你的访问级别、所用产品和当前容量。Freebuff Desktop 还可以通过你现有的提供商账户运行本地安装的 Claude Code 和 Codex 智能体；这些连接的模型不属于 Freebuff 的内置模型目录。

## Freebuff 的工作原理

Freebuff 使用专业化智能体，而不是把所有任务都交给同一个模型和同一条提示词。根据任务需要，智能体会收集上下文、制定计划、编辑或研究、运行工具并审查结果。

- **代码库上下文** —— 文件查找智能体会在编辑前定位项目中的相关部分。
- **实现与审查** —— 智能体可以拆分工作、修改文件、运行命令并检查结果。
- **研究与浏览器操作** —— 智能体可以查阅文档，并在真实浏览器中测试应用。
- **本地并行工作** —— Desktop 会将并发智能体隔离在各自的工作区中。
- **托管环境** —— Web 和 Cloud 提供沙箱、预览、终端和部署工作流。

## 免费访问

Freebuff 在所有国家和地区均可使用。受支持的地区提供完整访问；其他地区以及使用 VPN 的用户获得受限访问，目前包括 MiMo 2.5，每天可使用六个一小时会话。

内置模型由文字广告支持。开始前，Freebuff 会显示适用的会话限制以及模型特定的数据使用提示。

## 数据使用与隐私

**我的数据会用于训练 AI 吗？** 只有当模型或功能明确说明数据可能用于 AI 训练时才会。届时，Freebuff 或模型提供商可能保留提交内容，用于开发、训练、测试、评估、微调和改进 AI 模型或产品。

**我的数据会如何使用和存储？** 我们会使用提示词、消息、代码、文件和仓库数据来提供服务。我们可能会分析提示词和消息（包括粘贴的内容），通过 Freebuff 系统及代表我们行事的服务提供商来个性化广告。单独上传的文件和已连接的仓库不会提供给广告服务商。在法律要求的地区，我们提供广告选择并遵循公认的退出信号；在其他地区，此类处理可能是使用免费服务的必要条件。留存期限与完整详情请参阅隐私政策。

完整详情请参阅[隐私政策](https://freebuff.com/privacy-policy)。

## 参与贡献

Freebuff 是一个使用 Bun 构建的 TypeScript monorepo。欢迎为产品、智能体、工具、文档和底层运行时贡献代码。

```bash
git clone https://github.com/CodebuffAI/freebuff.git
cd freebuff
bun install
bun up
```

单独启动 CLI：

```bash
bun start-cli
```

环境配置及提交拉取请求前应运行的检查，请参阅[贡献指南](./CONTRIBUTING.md)、[开发指南](./docs/development.md)和[测试指南](./docs/testing.md)。

## 基于 Codebuff 构建

Freebuff 基于开放的多智能体框架 [Codebuff](https://codebuff.com) 构建，其编排、工具和 SDK 均由 Codebuff 提供。若要创建自定义智能体或将其嵌入其他应用，请参阅 [Codebuff 文档](https://codebuff.com/docs)和 [`@codebuff/sdk`](https://www.npmjs.com/package/@codebuff/sdk)。

## 链接

- [官网](https://freebuff.com)
- [GitHub](https://github.com/CodebuffAI/freebuff)
- [Discord](https://discord.gg/yXG3w7wxfs)
- [隐私政策](https://freebuff.com/privacy-policy)
- [许可证](./LICENSE)
