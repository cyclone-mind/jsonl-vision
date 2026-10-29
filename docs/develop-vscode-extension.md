# 从零开发并发布一个 VS Code 扩展

本文是给「做过一遍但记不清」用的备忘：官方最小路径 + 本仓库（JSONL Vision）实际走过的步骤。本仓库自己的构建/发版命令见 [`jsoncrack.com/apps/vscode/DEVELOPMENT.md`](../jsoncrack.com/apps/vscode/DEVELOPMENT.md)。

官方文档：

- [Your First Extension](https://code.visualstudio.com/api/get-started/your-first-extension)
- [Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

## 1. 先分清三套「账号 / 页面」

这是最容易混的地方。

| 你在哪                                                                                             | 看到什么                            | 用什么账号                                     |
| -------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| VS Code 扩展视图（`Ctrl+Shift+X`）                                                               | 搜商店、装扩展                      | VS Code 登录（可 GitHub）                      |
| [Marketplace 扩展页](https://marketplace.visualstudio.com/items?itemName=cyclone-mind.jsonl-vision) | 给用户看的说明                      | 不用登录也能看                                 |
| [Manage Publishers](https://marketplace.visualstudio.com/manage)                                    | **你发布的** publisher / 扩展 | 当初`vsce login` 的 **Microsoft 账号** |

扩展 ID 永远是 `<publisher>.<name>`。JSONL Vision 是 `cyclone-mind.jsonl-vision`：

- `publisher`：`cyclone-mind`（商店显示名 **MicroCyclone**，可以改；**ID 创建后不能改**）
- `name`：`jsonl-vision`（`package.json` 里的 `name`）

VS Code 里登录 ≠ 管理自己发的扩展。要管自己的，去 manage 页，不要在扩展视图里找「我发布的」。

## 2. 一个扩展本质是什么

三块，缺一不可：

1. **`package.json`（Extension Manifest）** — 静态声明：命令、菜单、设置、激活时机、`publisher` / `name` / `main`。
2. **Activation Events** — 什么时候真正加载你的代码。VS Code 1.74+ 起，`contributes.commands` 里声明的命令被调用时会隐式激活，不必再写 `onCommand:...`。
3. **VS Code API** — `activate()` 里 `registerCommand` / 开 webview / 改文档。入口必须 `export function activate(context)`。

身份字段：

```json
{
  "name": "jsonl-vision",
  "displayName": "JSONL Vision",
  "publisher": "cyclone-mind",
  "main": "./build/extension.js",
  "engines": { "vscode": "^1.100.0" }
}
```

`engines.vscode` 是「最低 VS Code API 版本」。用户的编辑器比这个旧，商店就不会装。

## 3. 从零脚手架（Hello World）

需要 Node.js 和 Git。

```sh
npx --package yo --package generator-code -- yo code
```

选 **New Extension (TypeScript)**，填名字 / identifier / 描述。生成后打开那个文件夹，按 **F5**（或 Command Palette → **Debug: Start Debugging**）。会弹出 **Extension Development Host** 窗口；在那个窗口里跑你的命令，不是原来那个窗口。

改代码后，在 Host 窗口跑 **Developer: Reload Window**（或 `Ctrl+R`）。

`yo code` 生成的典型结构：

```
.
├── .vscode/launch.json    # F5 启动 Extension Development Host
├── src/extension.ts       # activate / deactivate
├── package.json           # manifest
└── README.md              # 会原样出现在 Marketplace 页
```

最小 `activate`：

```ts
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("helloworld.helloWorld", () => {
      vscode.window.showInformationMessage("Hello World!");
    })
  );
}
```

`registerCommand` 的 id 必须和 `package.json` → `contributes.commands[].command` 一致。

## 4. 本仓库实际长什么样（比 Hello World 多一层）

JSONL Vision 不是纯命令扩展，是 **extension host + webview**：

| 路径                                        | 角色                                                     |
| ------------------------------------------- | -------------------------------------------------------- |
| `jsoncrack.com/apps/vscode/ext-src/`      | Host：命令、文档、把 JSON 文本`postMessage` 给 webview |
| `jsoncrack.com/apps/vscode/src/`          | Webview：React 图画、把编辑结果`postMessage` 回来      |
| `jsoncrack.com/packages/jsoncrack-react/` | 图引擎                                                   |

调试：打开 **monorepo 根** `jsoncrack.com/`，F5 跑 launch 配置 `Run VSCode Extension`，它把 `--extensionDevelopmentPath` 指到 `apps/vscode`。

```json
{
  "name": "Run VSCode Extension",
  "type": "extensionHost",
  "request": "launch",
  "args": ["--extensionDevelopmentPath=${workspaceFolder}/apps/vscode"],
  "outFiles": ["${workspaceFolder}/apps/vscode/build/**/*.js"],
  "preLaunchTask": "build vscode extension"
}
```

Host 不能直接 `import` webview 的 React 树；两边只靠 `webview.postMessage` / `onDidReceiveMessage`。UI 用 `--vscode-*` CSS 变量才能跟主题走。

贡献点本仓库用过的：

- `contributes.commands` — 命令
- `contributes.menus.editor/title` — 编辑器右上角按钮（`when` 限制 `.jsonl` / `.json`）
- `contributes.configuration` — `jsonl-vision.background`

`when` 子句文档：[When Clause Contexts](https://code.visualstudio.com/api/references/when-clause-contexts)。

## 5. 打包成 `.vsix`（还不发商店）

工具是 [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce)：

```sh
cd jsoncrack.com/apps/vscode
pnpm run vsc:package
# 或: npx vsce package --no-dependencies
```

本仓库 `--no-dependencies` 是因为图引擎已经打进 bundle，不需要再把 `node_modules` 塞进 vsix。

本地装：

```sh
code --install-extension .\jsonl-vision-0.1.1.vsix
```

或扩展视图 → `...` → **Install from VSIX...**。

`.vscodeignore` 决定 vsix **不带什么**。源码、测试、开发文档都应 ignore。`README.md` **不要** ignore —— 商店 Overview 就是它。

## 6. 上架 Marketplace

顺序固定：Azure DevOps 组织 → PAT → 创建 publisher → `vsce login` → `vsce publish`。

### 6.1 PAT

1. 打开 [Azure DevOps](https://go.microsoft.com/fwlink/?LinkId=307137)，没有组织就先建一个。
2. 头像 → **Personal access tokens** → **New Token**。
3. Organization 选 **All accessible organizations**（选具体组织会 401/403）。
4. Scopes → **Show all scopes** → **Marketplace → Manage**。
5. 创建后立刻复制。PAT 只显示一次。

全局 PAT 将在 **2026-12-01** 退役；之后官方推荐 Entra ID + managed identity 发版。现在手工发版仍可用 PAT。

### 6.2 创建 publisher

1. 打开 https://marketplace.visualstudio.com/manage
2. 用 **同一个 Microsoft 账号** 登录（不是 VS Code 里那个 GitHub）。
3. **Create publisher**：
   - **ID**：URL 用的，创建后不能改。本仓库是 `cyclone-mind`。
   - **Name**：商店显示名。本仓库是 MicroCyclone。
4. `package.json` 的 `publisher` 必须等于这个 ID。

```sh
vsce login cyclone-mind
# 提示输入 PAT，不要把 PAT 写进命令、源码或聊天
```

### 6.3 发布

版本号是不可变的：`0.1.1` 发过就不能再发 `0.1.1`，先改 `package.json` 的 `version`。

```powershell
cd jsoncrack.com\apps\vscode
pnpm run vsc:package
code --install-extension .\jsonl-vision-0.1.2.vsix   # 可选：先本地装一遍
.\node_modules\.bin\vsce.cmd publish --packagePath .\jsonl-vision-0.1.2.vsix
.\node_modules\.bin\vsce.cmd show cyclone-mind.jsonl-vision --json
```

也可以 `vsce publish patch|minor|major` 让 vsce 改版本再发。

页面出现可能要几分钟。公开 URL：

`https://marketplace.visualstudio.com/items?itemName=<publisher>.<name>`

管理（安装量、评分、再传 vsix）：https://marketplace.visualstudio.com/manage
本仓库：https://marketplace.visualstudio.com/manage/publishers/cyclone-mind

## 7. 商店页写什么、不写什么

Marketplace Overview = 扩展根目录 `README.md`。用户打开扩展页就会看到全文。

**该写：** 做什么、怎么用、设置、隐私、致谢。

**不该写：** `pnpm install`、F5 调试、`vsce login`、PAT 注意事项。那些放 `DEVELOPMENT.md`，并在 `.vscodeignore` 里排除，避免打进 vsix。

其它商店约束（`vsce` 会拦）：

- `icon` 必须是 PNG，不能是 SVG，建议 ≥ 128×128。
- README / CHANGELOG 里的图必须是 `https`，且一般不能是 SVG。
- `keywords` 最多 30 个。
- `name` 和 `displayName` 全商店唯一。删掉的扩展名也**不能重用**。

`vsce` 若发现 `package.json` 有公开 GitHub `repository`，会按默认 `main` 分支改写 README 里的相对链接。可用 `--githubBranch` / `--baseContentUrl` 覆盖。

## 8. 更新、下架、删版本

| 动作      | 怎么做                                      | 注意                                            |
| --------- | ------------------------------------------- | ----------------------------------------------- |
| 发新版    | 升`version` → `vsce publish`           | 旧 version 不能复用                             |
| Unpublish | manage 页 → More Actions → Unpublish      | 还能被 API 发现，统计还在                       |
| Remove    | `vsce unpublish <id>` 或 manage 页 Remove | **不可逆**，名字永久占用                  |
| 删某一版  | manage → Reports → Delete this version    | 不能删**当前最新版**，该 version 不能再发 |

## 9. 本仓库发版检查单

优先推送与 `apps/vscode/package.json` 里 `version` 一致的 tag `v*.*.*`。仓库根目录 [`.github/workflows/release.yml`](../.github/workflows/release.yml) 会打一次 `.vsix`，发布到 VS Code Marketplace（secret `VSCE_PAT`）和 Open VSX（secret `OVSX_PAT`），并把同一个 `.vsix` 挂到 GitHub release。某个 secret 没配时，这一步告警并跳过，另一步照常。Open VSX 还要先签 Eclipse publisher agreement，并执行一次 `npx ovsx create-namespace cyclone-mind`。细节在根目录 README 的 Release。不要在这里的例子上直接 `vsce publish` 同一版本，否则 tag 工作流会因为版本已存在而失败。

下面是工作流不能跑时的手工清单，对照 [`DEVELOPMENT.md`](../jsoncrack.com/apps/vscode/DEVELOPMENT.md)：

1. 升 `apps/vscode/package.json` 的 `version`。
2. `pnpm install --frozen-lockfile`（在 `jsoncrack.com/`）。
3. `pnpm --filter jsoncrack-react test`
4. `pnpm build:vscode`
5. `apps/vscode` 里 `vsce login cyclone-mind`（PAT 只贴进隐藏提示）。
6. `pnpm run vsc:package`
7. 可选：`code --install-extension .\jsonl-vision-<version>.vsix`
8. `vsce publish --packagePath .\jsonl-vision-<version>.vsix`
9. `vsce show cyclone-mind.jsonl-vision --json` 确认公开元数据。
10. 打开 Marketplace 页，确认 Overview 是用户说明，没有开发步骤。

## 10. 常见翻车

- **扩展视图里找不到自己发的** — 那不是管理页。去 https://marketplace.visualstudio.com/manage ，用 Microsoft 账号。
- **manage 页是空的** — 登录的账号不是创建 publisher 的那个。
- **`vsce publish` 401/403** — PAT 的 Organization 没选 All accessible organizations，或 scope 不是 Marketplace Manage。
- **商店页出现 `pnpm` / `vsce login`** — 写进了 `README.md`。开发说明另放文件并 `.vscodeignore`。
- **发 0.1.1 报 already exists** — version 不可变，先升号。
- **F5 没反应 / 命令找不到** — 看是不是在 **Extension Development Host** 里跑命令；再看 `engines.vscode` 是否高于你本机 VS Code。
- **Host 里 `import` 了 React 组件** — 不行。UI 进 webview bundle，消息往来。
- **Windows 打的 vsix 丢可执行位** — POSIX 可执行位在 Windows 打包时不会保留。需要 native/可执行依赖时在 Linux/macOS 打。
