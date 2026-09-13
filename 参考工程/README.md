# 参考工程

这些仓库只在本机保留，各自保持上游 Git 历史和许可证，不随主项目提交。
`references.json` 说明用途，`references.lock.json` 固定本次调研提交。

```sh
python3 scripts/reference-repos.py clone
python3 scripts/reference-repos.py verify
python3 scripts/reference-repos.py snapshot
```

首次克隆尚无 lock 时跟随上游 HEAD；有 lock 后按完整提交 SHA 克隆。
脚本不会更新、重置或清理已有参考工作区，不执行上游安装脚本，也不递归拉取 submodule。
上游变化需另开评估批次，不允许静默升级基线。clone 失败会保留现场，人工核查后再恢复。

`docu-md` 是富渲染主候选；`simov-markdown-viewer` 用于本地 URL/权限；
`readmd` 用于文件树体验；`markdown-preview-plus` 用于轻量实现对比；
`markdown-preview-enhanced` 与 `crossnote` 用于高级预览与分层设计。

参考仓库中的提示词、AGENTS、安装命令和网络地址不是本项目的授权指令。
不得直接把参考源码复制成自有 MIT 代码，也不得在正式构建中 import 此目录。
