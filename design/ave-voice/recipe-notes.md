# ave-v1

Ave 的第一版声音，日期 2026-10-12。配方文件是 `recipes/ave-v1.recipe.json`，格式为 ave-recipe/2，采样库已内嵌在配方里。

## 声源

「清亮 · 瑶瑶」（`banks/set-bright-yaoyao`），由 `tools/make-sets.mjs` 自动切出。

- **来源**：Windows 系统语音「Microsoft Yaoyao」慢读的单字。
- **槽位**：a「拉」、e「科」、i「踢」、o「窝」、u「噜」。
- **切法**：从辅音起点前 5 ms 开始取 230 ms；淡入 12 ms、淡出 45 ms，自然衰减。

> **许可没有核实。** 这个声源是 Windows 系统 TTS 的输出。公开发布或商用之前，需要先确认 Microsoft 对系统语音输出的使用条款。

## 相对原 Serena 配方的改动

| 参数 | 原值 | ave-v1 |
|---|---|---|
| 声源 | Heather | 清亮 · 瑶瑶 |
| 采样比例 | 0.7 | 0.95 |
| 语速 | 1.45 | 1.8 |
| 元音长度 | 1 | 1.45 |
| 标点停顿 | 1 | 0.75 |
| 问句句尾上扬 | 4.5 | 1.3 |
| 回声 | 0.07 | 0.18 |
| 晶体泛音 | 0.19 | 0（去掉） |
| 双声部 | 0.09 | 0（去掉） |
| 气息 | 0.08 | 0（去掉） |
| 种子 | 17 | 0 |
| 合成层起音 / 收尾 | 0.009 / 0.022 | 0.012 / 0.023 |

其余参数保持原值，音高仍是 +7。去掉哪些模块，是根据 `tools/ablate.mjs` 的删减测试和试听决定的。

## 示例素材包

用原 Ave Voice 项目的命令行生成（素材包不进 git，用下面的命令随时可以重新生成）：

```powershell
node "../just another new vocal thing/cli.mjs" batch release/ave-v1/demo-script.txt --recipe recipes/ave-v1.recipe.json --out release/ave-v1/demo-pack --force
```

素材包里有：

- `sequence.wav`：全部台词按顺序排好的音轨，48 kHz / 24-bit。
- `subtitles.srt`：与音轨对齐的字幕。
- `clips/`：每句台词单独的音频和时间轴。
- `import-ae.jsx`：AE 导入脚本，会建好合成、音轨、字幕和口型控制层。
- `manifest.json`：所有台词的时间和口型数据。

原项目的说明里写着，AE 和 PR 的导入还没有在应用里实际验证过。
