# Prompt DJ - 实时 AI 音乐生成器

本项目是一个交互式 Web 应用，允许用户通过 Google 的生成式 AI 模型实时创作音乐。用户可以扮演“提示词 DJ”的角色，通过提供文本提示词并调整它们的权重来混合和融合不同的音乐创意。

## ✨ 功能特性

- **实时音乐生成**: 利用 Google GenAI SDK 中的 Lyria 模型，创建连续的音乐流。
- **权重化提示词**: 添加多个文本提示词（例如，“Bossa Nova”，“Minimal Techno”），并实时调整它们对生成音乐的影响力。
- **交互式控件**:
    - **权重调整**: 使用可视化滑块和精确的数字输入框来修改提示词权重。
    - **拖拽排序**: 通过拖动句柄轻松更改提示词的顺序。
    - **增删提示词**: 动态添加新的音乐创意或移除现有的提示词。
- **高级生成参数**: 通过以下设置微调音乐输出：
    - Guidance (引导)
    - Temperature (温度)
    - Top K
    - Density & Brightness (密度与亮度，支持自动模式)
    - BPM & Seed (速度与种子)
    - Musical Scale (音阶)
- **播放管理**: 通过播放、暂停和重置功能完全控制音频流。
- **下载**: 将生成的音乐导出为 `.wav` 文件。
- **自适应 UI**: 用户界面会自动适应您操作系统的浅色或深色主题。

## 🚀 快速开始

### 环境要求

- Node.js 和 npm
- 一个 Google Gemini API 密钥

### 安装与设置

1.  **克隆代码仓库:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  **安装依赖:**
    ```bash
    npm install
    ```

3.  **设置您的 API 密钥:**
    在项目根目录中创建一个名为 `.env` 的文件，并添加您的 Gemini API 密钥：
    ```
    GEMINI_API_KEY="在此处填入您的API密钥"
    ```

4.  **运行开发服务器:**
    ```bash
    npm run dev
    ```

5.  打开浏览器并访问本地 URL (通常是 `http://localhost:5173`)。

## 🛠️ 技术栈

- **Lit**: 用于创建快速、轻量级的 Web 组件。
- **TypeScript**: 用于编写健壮、类型安全的代码。
- **Vite**: 作为构建工具和开发服务器。
- **@google/genai**: Google 官方的 JavaScript GenAI SDK。