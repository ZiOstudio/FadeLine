# legacy-python

**正常运行不需要这里的任何东西。**

抓前台窗口和检测全屏现在走 `../win32.js`（用 [koffi](https://www.npmjs.com/package/koffi) 在进程内直接调 Windows API）——不起子进程、不依赖外部运行时，也更快。

这两个脚本是那条路的老实现，留着只有一个用途：**当 koffi 加载失败时的兜底**。真要走到这一步，程序会在 `config.json` 里读出 `pythonPath`，然后把它们当子进程跑：

| 文件 | 作用 | 输出的东西 |
| --- | --- | --- |
| `foreground.py` | 抓当前前台窗口 | base64 编码的 JSON：`{app, title}` |
| `check_game.py` | 判断全屏/游戏状态 | base64 编码的 JSON：`{state, app}` |

两个脚本都只用 Python 标准库（`ctypes`），**不需要 pip 装任何东西**，Python 3 即可。

调用方是 `main.js` 里的 `readForeground()` 与 `queryGameState()`（各有一处 `is NATIVE_OK` 判断失败后的回退分支）。
