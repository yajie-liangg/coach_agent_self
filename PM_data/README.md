# PM_data

这是 49 份产品相关 Markdown 的跨书知识重组目录。原文件保持不变；学习骨架按主题组织，而不是按书名或原章节组织。

## 主要入口

- `framework.md`：可直接导入 Coach 的学习骨架，36 个 lesson，从宏观到微观、原理到执行。
- `materials.md`：由中间层文件合并生成的学习资料，每个知识块引用多个原文块。
- `middle-layer/`：学习总览与 12 个主题模块的综合内容，区分综合结论、方法、边界与来源。
- `reorganized-source/`：把全部 1,912 个原文块按主题重新排列的完整原文层；正文不改写，只增加定位标记。
- `raw/`：用户提供的 49 份原始 Markdown，未修改。
- `annotated-raw/`：添加稳定 `source_doc_id`、`source_block_id` 和位置标记的副本。
- `index/documents.csv`：文档编号、文件名、大小、哈希和原文块数量。
- `index/source-blocks.csv` 与 `source-blocks.jsonl`：1912 个原文块的精确索引。
- `index/by-module/`：每个原文块的主题路由，保留文件、标题路径和行号。
- `index/book-module-matrix.csv`：书籍与主题模块的交叉覆盖。
- `index/learning-nodes.csv` 与 `learning-relations.csv`：可作为轻量知识图谱使用的节点和关系表。
- `quality/coverage.md`：覆盖与低置信度路由统计。
- `quality/low-confidence-routes.md`：需要优先人工复核的 28 个主题路由及原文位置。
- `quality/material-validation.md`：骨架、中间层和原文引用的完整性检查。

## 来源标记读法

`pm016-b0009` 表示文档 `pm016` 的第 9 个原文块。先在 `index/source-blocks.csv` 查文件与行号，也可直接搜索 `annotated-raw/` 中的同名标记。中间层不替代原文；综合结论发生歧义时，以来源块为核对入口。

自动主题路由用于建立覆盖底账，不代表人工判断绝对正确。综合学习内容由人工按主题重写，并选择有代表性的跨书来源。低置信度块保留在覆盖报告中，后续可复核调整，不会静默遗漏。

## 重新生成索引

在仓库根目录执行：

```sh
python scripts/build_pm_data.py
python scripts/build_pm_materials.py
```

第一条命令只读取 `raw/` 并重建标注副本、索引和按主题重排的完整原文；第二条命令校验中间层后生成 `materials.md`、轻量关系表与质量报告。不要手工修改生成文件后再把它当成来源。
