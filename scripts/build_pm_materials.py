#!/usr/bin/env python3
"""Assemble and validate the human-written PM learning layer.

The source corpus builder owns mechanical source routing. This builder owns the
contract between the cross-book framework, the synthesized material blocks, and
their original source IDs. It fails before writing output when any reference is
missing or duplicated.
"""

from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "PM_data"
FRAMEWORK = DATA / "framework.md"
MIDDLE = DATA / "middle-layer"
INDEX = DATA / "index"
QUALITY = DATA / "quality"
ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]{0,63}$")
SOURCE_ID_PATTERN = re.compile(r"pm\d{3}-b\d{4}")


@dataclass(frozen=True)
class Material:
    material_id: str
    title: str
    source_ref: str
    source_ids: tuple[str, ...]
    markdown: str
    source_file: str


@dataclass(frozen=True)
class FrameworkNode:
    node_id: str
    title: str
    node_type: str
    parent_id: str | None
    position: int
    material_refs: tuple[str, ...]


class LearningCorpusBuilder:
    """Validate stable IDs and build import-ready and graph-shaped artifacts."""

    marker_pattern = re.compile(r"^<!-- ([a-z_]+): (.*?) -->$")
    heading_pattern = re.compile(r"^(#{1,6})\s+(.+?)\s*$")

    def __init__(self) -> None:
        self.source_blocks = self._load_source_blocks()

    def _load_source_blocks(self) -> dict[str, dict[str, object]]:
        path = INDEX / "source-blocks.jsonl"
        rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
        return {str(row["block_id"]): row for row in rows}

    def read_materials(self) -> list[Material]:
        materials: list[Material] = []
        for path in sorted(MIDDLE.glob("M*.md")):
            text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
            matches = list(re.finditer(r"^##\s+(.+?)\s*$", text, re.MULTILINE))
            for index, match in enumerate(matches):
                end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
                block = text[match.start() : end].strip()
                marker_lines = block.splitlines()[1:3]
                markers: dict[str, str] = {}
                for line in marker_lines:
                    marker = self.marker_pattern.fullmatch(line.strip())
                    if marker:
                        markers[marker.group(1)] = marker.group(2)
                material_id = markers.get("material_id", "")
                source_ref = markers.get("source_ref", "")
                if not ID_PATTERN.fullmatch(material_id):
                    raise ValueError(f"{path.name}: {match.group(1)} 缺少或包含无效 material_id")
                if not source_ref:
                    raise ValueError(f"{path.name}: {material_id} 缺少 source_ref")
                source_ids = tuple(dict.fromkeys(SOURCE_ID_PATTERN.findall(source_ref)))
                if not source_ids:
                    raise ValueError(f"{path.name}: {material_id} 没有可定位的原文块")
                missing = [source_id for source_id in source_ids if source_id not in self.source_blocks]
                if missing:
                    raise ValueError(f"{path.name}: {material_id} 引用了不存在的原文块 {missing}")
                materials.append(
                    Material(
                        material_id=material_id,
                        title=match.group(1),
                        source_ref=source_ref,
                        source_ids=source_ids,
                        markdown=block,
                        source_file=path.name,
                    )
                )
        ids = [material.material_id for material in materials]
        duplicates = sorted({item for item in ids if ids.count(item) > 1})
        if duplicates:
            raise ValueError(f"中间层包含重复 material_id: {duplicates}")
        return materials

    def read_framework(self) -> list[FrameworkNode]:
        lines = FRAMEWORK.read_text(encoding="utf-8").replace("\r\n", "\n").splitlines()
        nodes: list[FrameworkNode] = []
        stack: list[tuple[int, str]] = []
        for index, line in enumerate(lines):
            heading = self.heading_pattern.fullmatch(line)
            if not heading:
                continue
            level = len(heading.group(1))
            markers: dict[str, str] = {}
            cursor = index + 1
            while cursor < len(lines):
                marker = self.marker_pattern.fullmatch(lines[cursor].strip())
                if not marker:
                    break
                markers[marker.group(1)] = marker.group(2)
                cursor += 1
            required = {"node_id", "node_type", "material_refs"}
            if not required.issubset(markers):
                raise ValueError(f"framework.md:{index + 1} 节点标记不完整")
            node_id = markers["node_id"]
            if not ID_PATTERN.fullmatch(node_id):
                raise ValueError(f"framework.md:{index + 1} node_id 无效")
            while stack and stack[-1][0] >= level:
                stack.pop()
            refs_value = markers["material_refs"]
            refs = () if refs_value == "none" else tuple(
                item.strip() for item in refs_value.split(",")
            )
            nodes.append(
                FrameworkNode(
                    node_id=node_id,
                    title=heading.group(2),
                    node_type=markers["node_type"],
                    parent_id=stack[-1][1] if stack else None,
                    position=len(nodes),
                    material_refs=refs,
                )
            )
            stack.append((level, node_id))
        ids = [node.node_id for node in nodes]
        if len(ids) != len(set(ids)):
            raise ValueError("framework.md 包含重复 node_id")
        return nodes

    def validate_contract(
        self, materials: list[Material], nodes: list[FrameworkNode]
    ) -> tuple[list[str], list[str]]:
        material_ids = {material.material_id for material in materials}
        referenced = {
            reference for node in nodes for reference in node.material_refs
        }
        missing = sorted(referenced - material_ids)
        unused = sorted(material_ids - referenced)
        if missing:
            raise ValueError(f"框架引用了不存在的中间层资料: {missing}")
        if unused:
            raise ValueError(f"中间层资料未被框架引用: {unused}")
        return missing, unused

    def write_materials(self, materials: list[Material]) -> None:
        output = [
            "<!-- coach_protocol: 1 -->",
            "<!-- document_type: materials -->",
            "",
            "# 产品经理跨书学习资料",
            "",
            "说明：以下内容是依据用户提供的 49 份 Markdown 资料整理的中间层，不是逐字原文。",
            "每个资料块通过 source_ref 回到原文索引；完整原文按主题重排在 reorganized-source。",
            "",
        ]
        output.extend(material.markdown + "\n" for material in materials)
        (DATA / "materials.md").write_text("\n".join(output).rstrip() + "\n", encoding="utf-8")

    def write_graph(self, materials: list[Material], nodes: list[FrameworkNode]) -> None:
        with (INDEX / "learning-nodes.csv").open(
            "w", encoding="utf-8-sig", newline=""
        ) as handle:
            writer = csv.DictWriter(
                handle,
                fieldnames=["node_id", "title", "node_type", "parent_id", "position", "material_refs"],
            )
            writer.writeheader()
            for node in nodes:
                writer.writerow(
                    {
                        "node_id": node.node_id,
                        "title": node.title,
                        "node_type": node.node_type,
                        "parent_id": node.parent_id or "",
                        "position": node.position,
                        "material_refs": "|".join(node.material_refs),
                    }
                )
        relations: list[dict[str, str]] = []
        for node in nodes:
            if node.parent_id:
                relations.append(
                    {"source": node.parent_id, "relation": "contains", "target": node.node_id}
                )
            for reference in node.material_refs:
                relations.append(
                    {"source": node.node_id, "relation": "supported_by", "target": reference}
                )
        lessons = [node for node in nodes if node.node_type == "lesson"]
        for current, following in zip(lessons, lessons[1:]):
            relations.append(
                {"source": current.node_id, "relation": "precedes", "target": following.node_id}
            )
        for material in materials:
            for source_id in material.source_ids:
                relations.append(
                    {"source": material.material_id, "relation": "derived_from", "target": source_id}
                )
        with (INDEX / "learning-relations.csv").open(
            "w", encoding="utf-8-sig", newline=""
        ) as handle:
            writer = csv.DictWriter(handle, fieldnames=["source", "relation", "target"])
            writer.writeheader()
            writer.writerows(relations)

    def write_report(self, materials: list[Material], nodes: list[FrameworkNode]) -> None:
        cited_blocks = {source_id for material in materials for source_id in material.source_ids}
        cited_documents = {source_id.split("-")[0] for source_id in cited_blocks}
        lessons = [node for node in nodes if node.node_type == "lesson"]
        report = [
            "# 学习层校验报告",
            "",
            f"- 框架节点：{len(nodes)}",
            f"- 可学习节点：{len(lessons)}",
            f"- 中间层资料块：{len(materials)}",
            f"- 中间层代表性原文引用：{len(cited_blocks)}",
            f"- 中间层直接引用的原始文档：{len(cited_documents)} / 49",
            "- 重复节点编号：0",
            "- 重复资料编号：0",
            "- 悬空资料引用：0",
            "- 不存在的原文块引用：0",
            "- 未被框架引用的中间层资料：0",
            "",
            "中间层使用代表性原文支撑综合解释；这不是原文覆盖率。全部 1,912 个原文块均保留在原文索引和按主题重排的完整原文层。",
            "自动主题路由是第一版语义分类，低置信度项见 coverage.md，后续可人工调整主模块而不更改稳定 source_block_id。",
            "",
            "| 资料块 | 来源文件 | 原文引用数 |",
            "| --- | --- | ---: |",
        ]
        for material in materials:
            report.append(
                f"| {material.material_id} | {material.source_file} | {len(material.source_ids)} |"
            )
        (QUALITY / "material-validation.md").write_text(
            "\n".join(report) + "\n", encoding="utf-8"
        )

    def build(self) -> None:
        materials = self.read_materials()
        nodes = self.read_framework()
        self.validate_contract(materials, nodes)
        self.write_materials(materials)
        self.write_graph(materials, nodes)
        self.write_report(materials, nodes)
        print(
            f"Built {len(materials)} materials for "
            f"{sum(node.node_type == 'lesson' for node in nodes)} lessons."
        )


if __name__ == "__main__":
    LearningCorpusBuilder().build()
