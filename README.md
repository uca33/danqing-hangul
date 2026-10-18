# 丹青韩语 · 단청 한국어

以《明日方舟:终末地》「丹青渡」为主题的韩语学习网站(同人作品)。纯静态站点,零新增费用。

## 功能
1. **流行语卡片**、**生活词汇卡片**:随机抽取、翻面、发音(浏览器自带语音)。数据在 `data/trending.json`、`data/daily.json`。
2. **查询**:输入任意韩语(词、语法、句子、整段),先查站内词库;填入自己的 AI 密钥(Gemini 免费额度或 Anthropic)后可做完整分析。密钥只保存在访问者自己的浏览器里。
3. **每日新闻**:主流媒体 RSS 的标题与摘要 + 词汇/语法/表达/热点解析。
4. **视频新闻**:KBS / MBC / YTN / 연합뉴스TV 官方频道,页面内用官方嵌入播放。
5. **论文**:每日推送 KCI(及可选的 RISS)上可免费获取全文的国语学、国文学及融合领域论文,中文摘要解析基于作者摘要。
6. **整页 3D 水墨场景**(`js/scene.js`,Three.js r170,`vendor/three.module.min.js`):随滚动流动,低配核显自适应,支持减少动效与无 WebGL 后备。

## 桌面入口
双击 `Create-Shortcut.vbs` 会在桌面生成带头像图标的「丹青韩语」快捷方式;双击它即可启动(无需安装任何软件,用 Windows 自带的 PowerShell 提供本地服务)。图标素材在 `assets/icon/`。

## 本地预览
```
python3 -m http.server 8765
```
打开 http://localhost:8765 。

## 部署(免费)
1. 新建 GitHub 仓库并推送本目录,在 Settings → Pages 选择分支根目录发布(或接入 Cloudflare Pages)。
2. Settings → Secrets and variables → Actions 添加:
   - `KCI_API_KEY`(必需,论文):在 https://open.kci.go.kr 申请开放 API 密钥。
   - `GEMINI_API_KEY`(建议,新闻/论文解析):Google AI Studio 免费密钥。
   - `RISS_API_KEY`(可选,RISS 论文)。
   - 变量 `GEMINI_MODEL`(可选,默认 `gemini-2.5-flash`)。
3. Actions → 「每日更新」→ Run workflow 手动跑一次;之后每天首尔时间 06:00 自动运行并提交 `data/*.json`。

脚本无依赖,Node ≥ 20。测试:`node --test "scripts/test/*.test.mjs"`。本地试跑:`node scripts/update-news.mjs --dry-run`(新闻/视频/论文同理)。

## 需要注意
- `scripts/config/feeds.json` 里的新闻 RSS 地址与 YouTube 频道 ID 需在首次运行后核对(Actions 的运行摘要会列出每个源成功与否);频道名不符会被自动跳过。
- RISS 接口字段映射未经实测,可设置 `RISS_DEBUG=1` 查看原始返回再调整 `scripts/lib/riss.mjs`。
- 新闻解析只依据标题与 RSS 摘要,不读全文;论文解析只依据作者摘要。页面均已注明。
- 版权:新闻与视频仅提供标题、链接与官方嵌入;论文仅提供链接与自撰解析。

## 美术素材
`assets/art/art1–4.jpg` 来自官方宣传素材,已裁去底部水印区域。正式提交时建议替换为官方无水印版本(文件名不变即可)。本站为同人作品,与鹰角网络无官方关联。
