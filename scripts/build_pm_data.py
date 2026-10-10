#!/usr/bin/env python3
"""Build a traceable product-management corpus from user-provided Markdown files.

The script never rewrites raw files. It creates stable document/block IDs, annotated
copies, a complete source index, and a first-pass thematic routing table. Thematic
routing is deterministic and auditable; human-written synthesis lives separately.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "PM_data"
RAW = DATA / "raw"
ANNOTATED = DATA / "annotated-raw"
INDEX = DATA / "index"
QUALITY = DATA / "quality"
REORGANIZED = DATA / "reorganized-source"


MODULES = {
    "m01-product-system": {
        "title": "产品系统与价值创造",
        "keywords": ["产品是什么", "产品定义", "产品价值", "用户价值", "企业", "交易", "成本", "系统思维", "第一性", "产品思维"],
    },
    "m02-market-strategy": {
        "title": "市场、商业与产品战略",
        "keywords": ["市场", "竞争", "战略", "商业模式", "盈利", "定位", "品牌", "创新", "从0到1", "垄断", "路线图", "生命周期"],
    },
    "m03-user-cognition": {
        "title": "用户、场景与行为原理",
        "keywords": ["用户", "场景", "心理", "认知", "行为", "习惯", "动机", "触发", "酬赏", "心智", "情感", "画像"],
    },
    "m04-research-needs": {
        "title": "用户研究与需求分析",
        "keywords": ["需求", "调研", "访谈", "问卷", "观察", "痛点", "研究", "洞察", "问题", "反馈", "优先级", "采集"],
    },
    "m05-definition-design": {
        "title": "产品定义、方案与体验设计",
        "keywords": ["方案", "设计", "体验", "交互", "原型", "信息架构", "流程", "简约", "可用性", "MVP", "功能", "界面", "动效"],
    },
    "m06-delivery-collaboration": {
        "title": "需求管理、交付与协作",
        "keywords": ["PRD", "MRD", "BRD", "文档", "项目", "研发", "测试", "评审", "协作", "沟通", "排期", "上线", "敏捷", "迭代", "管理"],
    },
    "m07-data-experiment": {
        "title": "数据、指标与实验迭代",
        "keywords": ["数据", "指标", "分析", "实验", "验证", "度量", "转化率", "漏斗", "留存", "精益", "统计", "假设"],
    },
    "m08-growth-operation": {
        "title": "运营、增长与传播",
        "keywords": ["运营", "增长", "获客", "激活", "留存", "传播", "营销", "口碑", "社交", "社群", "病毒", "分享", "引爆", "广告"],
    },
    "m09-technology-architecture": {
        "title": "技术理解与系统架构",
        "keywords": ["技术", "架构", "网站", "数据库", "缓存", "分布式", "性能", "容量", "安全", "前端", "后端", "API", "算法", "工程"],
    },
    "m10-domain-products": {
        "title": "垂直产品与复杂业务系统",
        "keywords": ["电商", "B端", "后台", "商品", "订单", "库存", "支付", "物流", "数据产品", "广告系统", "游戏", "社交产品", "平台"],
    },
    "m11-organization-leadership": {
        "title": "组织、领导与产品治理",
        "keywords": ["组织", "团队", "领导", "文化", "绩效", "资源", "决策", "跨部门", "授权", "冲突", "目标", "治理"],
    },
    "m12-career-capability": {
        "title": "产品经理能力与职业成长",
        "keywords": ["产品经理", "能力", "职业", "面试", "简历", "入门", "成长", "人才", "岗位", "职责", "时间管理", "工作法"],
    },
    "a01-cases-history": {
        "title": "案例、行业史与扩展阅读",
        "keywords": ["案例", "故事", "历史", "十年", "复盘", "背景", "访谈录", "产品事", "独角兽", "未来", "艺术"],
    },
    "a02-editorial": {
        "title": "出版信息、序言与非知识正文",
        "keywords": ["版权", "序言", "推荐序", "前言", "致谢", "附录", "好评", "推荐语", "编委", "译者", "目录", "内容简介"],
    },
}


@dataclass
class SourceBlock:
    block_id: str
    doc_id: str
    source_file: str
    heading: str
    heading_path: str
    level: int
    start_line: int
    end_line: int
    char_count: int
    sha256: str
    primary_module: str
    secondary_modules: list[str]
    confidence: str


def stable_doc_ids(files: list[Path]) -> dict[Path, str]:
    return {path: f"pm{index:03d}" for index, path in enumerate(files, 1)}


def classify(text: str) -> tuple[str, list[str], str]:
    lowered = text.lower()
    scores: dict[str, int] = {}
    for module_id, module in MODULES.items():
        score = 0
        for keyword in module["keywords"]:
            count = lowered.count(keyword.lower())
            if count:
                score += min(count, 4) * (3 if keyword.lower() in lowered[:300] else 1)
        scores[module_id] = score
    ranked = sorted(scores, key=lambda item: (-scores[item], item))
    primary = ranked[0] if scores[ranked[0]] else "a01-cases-history"
    secondary = [item for item in ranked[1:4] if scores[item] and scores[item] >= scores[primary] * 0.45]
    if scores[primary] >= 12:
        confidence = "high"
    elif scores[primary] >= 5:
        confidence = "medium"
    else:
        confidence = "low"
    return primary, secondary, confidence


def parse_blocks(path: Path, doc_id: str) -> tuple[list[SourceBlock], str]:
    text = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    lines = text.splitlines()
    headings: list[tuple[int, int, str]] = []
    in_fence = False
    fence = ""
    for index, line in enumerate(lines, 1):
        stripped = line.lstrip()
        if stripped.startswith(("```", "~~~")):
            marker = stripped[:3]
            if not in_fence:
                in_fence, fence = True, marker
            elif marker == fence:
                in_fence = False
            continue
        if in_fence:
            continue
        match = re.match(r"^(#{1,6})\s+(.+?)\s*$", line)
        if match:
            headings.append((index, len(match.group(1)), match.group(2)))

    boundaries: list[tuple[int, int, str]] = []
    if not headings or headings[0][0] > 1:
        boundaries.append((1, 0, "文档开头"))
    boundaries.extend(headings)
    blocks: list[SourceBlock] = []
    annotated: list[str] = [
        "<!-- coach_source_protocol: 1 -->",
        f"<!-- source_doc_id: {doc_id} -->",
        f"<!-- source_file: {path.name} -->",
        "",
    ]
    stack: list[tuple[int, str]] = []
    block_number = 0
    for position, (start, level, heading) in enumerate(boundaries):
        end = boundaries[position + 1][0] - 1 if position + 1 < len(boundaries) else len(lines)
        content = "\n".join(lines[start - 1 : end]).strip()
        if not content:
            continue
        if level:
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, heading))
            heading_path = " / ".join(item[1] for item in stack)
        else:
            heading_path = "文档开头"
        block_number += 1
        block_id = f"{doc_id}-b{block_number:04d}"
        sample = f"{path.stem}\n{heading_path}\n{content[:1800]}"
        primary, secondary, confidence = classify(sample)
        block = SourceBlock(
            block_id=block_id,
            doc_id=doc_id,
            source_file=path.name,
            heading=heading,
            heading_path=heading_path,
            level=level,
            start_line=start,
            end_line=end,
            char_count=len(content),
            sha256=hashlib.sha256(content.encode()).hexdigest(),
            primary_module=primary,
            secondary_modules=secondary,
            confidence=confidence,
        )
        blocks.append(block)
        annotated.extend(
            [
                f"<!-- source_block_id: {block_id} -->",
                f"<!-- source_location: {path.name}#L{start}-L{end} -->",
                f"<!-- primary_module: {primary} -->",
                content,
                "",
            ]
        )
    return blocks, "\n".join(annotated).rstrip() + "\n"


def main() -> None:
    files = sorted(RAW.glob("*.md"), key=lambda path: path.name)
    if not files:
        raise SystemExit("PM_data/raw 中没有 Markdown 文件")
    for directory in (ANNOTATED, INDEX, QUALITY, REORGANIZED):
        directory.mkdir(parents=True, exist_ok=True)
    doc_ids = stable_doc_ids(files)
    all_blocks: list[SourceBlock] = []
    manifest_rows: list[dict[str, object]] = []
    for path in files:
        doc_id = doc_ids[path]
        blocks, annotated = parse_blocks(path, doc_id)
        (ANNOTATED / f"{doc_id}-{path.name}").write_text(annotated, encoding="utf-8")
        raw_bytes = path.read_bytes()
        manifest_rows.append(
            {
                "doc_id": doc_id,
                "source_file": path.name,
                "bytes": len(raw_bytes),
                "sha256": hashlib.sha256(raw_bytes).hexdigest(),
                "blocks": len(blocks),
            }
        )
        all_blocks.extend(blocks)

    with (INDEX / "documents.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=manifest_rows[0].keys())
        writer.writeheader()
        writer.writerows(manifest_rows)
    with (INDEX / "source-blocks.jsonl").open("w", encoding="utf-8") as handle:
        for block in all_blocks:
            handle.write(json.dumps(asdict(block), ensure_ascii=False) + "\n")
    with (INDEX / "source-blocks.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        fieldnames = list(asdict(all_blocks[0]).keys())
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for block in all_blocks:
            row = asdict(block)
            row["secondary_modules"] = "|".join(row["secondary_modules"])
            writer.writerow(row)

    by_module = INDEX / "by-module"
    by_module.mkdir(exist_ok=True)
    source_paths = {doc_ids[path]: path for path in files}
    source_lines = {
        doc_id: path.read_text(encoding="utf-8-sig").replace("\r\n", "\n").replace("\r", "\n").splitlines()
        for doc_id, path in source_paths.items()
    }
    for module_id, module in MODULES.items():
        selected = [block for block in all_blocks if block.primary_module == module_id]
        rows = [
            f"# {module_id} {module['title']}：原文路由",
            "",
            "此文件是完整索引，不是学习内容。每行可定位到保留原文及带标记副本。",
            "",
            "| 原文块 | 文档 | 标题路径 | 行号 | 字符 | 置信度 |",
            "| --- | --- | --- | ---: | ---: | --- |",
        ]
        for block in selected:
            safe_path = block.heading_path.replace("|", "\\|").replace("\n", " ")
            safe_file = block.source_file.replace("|", "\\|")
            rows.append(
                f"| {block.block_id} | {block.doc_id} {safe_file} | {safe_path} | "
                f"{block.start_line}-{block.end_line} | {block.char_count} | {block.confidence} |"
            )
        (by_module / f"{module_id}.md").write_text("\n".join(rows) + "\n", encoding="utf-8")

        corpus = [
            f"# {module['title']}：按主题重排的完整原文",
            "",
            "本文件由脚本生成。正文保持用户原始 Markdown 内容；只增加块边界与定位标记。",
            "每个原文块只进入一个主模块，次级主题关系见 `index/source-blocks.csv`。",
            "",
        ]
        for block in selected:
            original = "\n".join(
                source_lines[block.doc_id][block.start_line - 1 : block.end_line]
            ).strip()
            corpus.extend(
                [
                    "---",
                    f"<!-- source_block_id: {block.block_id} -->",
                    f"<!-- source_doc_id: {block.doc_id} -->",
                    f"<!-- source_file: {block.source_file} -->",
                    f"<!-- source_location: L{block.start_line}-L{block.end_line} -->",
                    f"<!-- heading_path: {block.heading_path.replace('--', '—')} -->",
                    "",
                    original,
                    "",
                ]
            )
        (REORGANIZED / f"{module_id}.md").write_text(
            "\n".join(corpus).rstrip() + "\n", encoding="utf-8"
        )

    doc_module_counts: dict[tuple[str, str], dict[str, int]] = {}
    for block in all_blocks:
        key = (block.doc_id, block.primary_module)
        item = doc_module_counts.setdefault(key, {"blocks": 0, "chars": 0})
        item["blocks"] += 1
        item["chars"] += block.char_count
    with (INDEX / "book-module-matrix.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["doc_id", "source_file", "module_id", "blocks", "chars"],
        )
        writer.writeheader()
        names = {row["doc_id"]: row["source_file"] for row in manifest_rows}
        for (doc_id, module_id), counts in sorted(doc_module_counts.items()):
            writer.writerow(
                {
                    "doc_id": doc_id,
                    "source_file": names[doc_id],
                    "module_id": module_id,
                    **counts,
                }
            )

    module_counts = {module: {"blocks": 0, "chars": 0, "low": 0} for module in MODULES}
    for block in all_blocks:
        module_counts[block.primary_module]["blocks"] += 1
        module_counts[block.primary_module]["chars"] += block.char_count
        if block.confidence == "low":
            module_counts[block.primary_module]["low"] += 1
    report = [
        "# 语料覆盖报告",
        "",
        f"- 原始文件：{len(files)}",
        f"- 原文块：{len(all_blocks)}",
        f"- 已分配主模块：{sum(item['blocks'] for item in module_counts.values())}",
        f"- 原文字符（含标题）：{sum(block.char_count for block in all_blocks)}",
        f"- 低置信度路由：{sum(item['low'] for item in module_counts.values())}",
        "",
        "每个原文块都有且只有一个主模块，可另有多个次级模块。低置信度表示需要人工复核，不表示内容被遗漏。出版信息单列，不进入主学习进度。",
        "",
        "| 模块 | 原文块 | 字符数 | 低置信度 |",
        "| --- | ---: | ---: | ---: |",
    ]
    for module_id, module in MODULES.items():
        counts = module_counts[module_id]
        report.append(f"| {module_id} {module['title']} | {counts['blocks']} | {counts['chars']} | {counts['low']} |")
    (QUALITY / "coverage.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    low_confidence = [
        "# 低置信度主题路由",
        "",
        "以下原文块的标题与正文主题信号较弱，需要优先人工复核。调整主模块时保留 source_block_id。",
        "",
        "| 原文块 | 当前模块 | 来源 | 标题路径 | 行号 |",
        "| --- | --- | --- | --- | ---: |",
    ]
    for block in (item for item in all_blocks if item.confidence == "low"):
        low_confidence.append(
            f"| {block.block_id} | {block.primary_module} | "
            f"{block.doc_id} {block.source_file.replace('|', '\\|')} | "
            f"{block.heading_path.replace('|', '\\|')} | {block.start_line}-{block.end_line} |"
        )
    (QUALITY / "low-confidence-routes.md").write_text(
        "\n".join(low_confidence) + "\n", encoding="utf-8"
    )
    (INDEX / "modules.json").write_text(json.dumps(MODULES, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
