import { marked } from 'marked';
import { AppError, type FrameworkNode, type MaterialBlock, type ParsedCourse } from './types.js';
interface Heading {
  level: number;
  title: string;
  line: number;
  start: number;
  end: number;
}
interface Marker {
  key: string;
  value: string;
  line: number;
  start: number;
}
interface Scan {
  headings: Heading[];
  markers: Marker[];
  text: string;
}
const ID = /^[a-z][a-z0-9-]{0,63}$/;
/** Parse only top-level Markdown tokens: fenced examples and blockquotes are not control metadata. */
export class MarkdownImporter {
  private fail(file: string, line: number, reason: string): never {
    throw new AppError(`${file}:${line} ${reason}`);
  }
  private scan(source: string, file: string, kind: string): Scan {
    const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const headings: Heading[] = [];
    const markers: Marker[] = [];
    let offset = 0;
    for (const token of marked.lexer(text)) {
      const line = text.slice(0, offset).split('\n').length;
      if (token.type === 'heading')
        headings.push({
          level: token.depth,
          title: token.text,
          line,
          start: offset,
          end: offset + token.raw.length,
        });
      if (token.type === 'html') {
        let local = 0;
        for (const raw of token.raw.split('\n')) {
          const match = raw.match(/^<!-- ([a-z_]+): (.*?) -->\s*$/);
          if (match)
            markers.push({
              key: match[1],
              value: match[2],
              line: line + local,
              start:
                offset + token.raw.split('\n').slice(0, local).join('\n').length + (local ? 1 : 0),
            });
          else if (
            /<!--\s*(coach_protocol|document_type|node_id|node_type|material_refs|material_id|source_ref)\s*:/.test(
              raw,
            )
          )
            this.fail(file, line + local, '标记必须独占一行且符合协议格式');
          local++;
        }
      }
      offset += token.raw.length;
    }
    const first = headings[0];
    if (!first || first.level !== 1 || headings.filter((h) => h.level === 1).length !== 1)
      this.fail(file, 1, '需要唯一的一级标题');
    const header = markers.filter((m) => m.start < first.start);
    if (
      header.length !== 2 ||
      header[0]?.key !== 'coach_protocol' ||
      header[0].value !== '1' ||
      header[1]?.key !== 'document_type' ||
      header[1].value !== kind
    )
      this.fail(file, 1, '文件头或协议版本无效');
    return { text, headings, markers: markers.filter((m) => m.start >= first.start) };
  }
  private section(
    scan: Scan,
    heading: Heading,
    end: number,
    file: string,
    required: string[],
    optional: string[] = [],
  ): { values: Record<string, string>; body: string } {
    const markers = scan.markers.filter((m) => m.start >= heading.end && m.start < end);
    const values: Record<string, string> = {};
    let cursor = heading.end;
    for (const marker of markers) {
      if (
        ![...required, ...optional].includes(marker.key) ||
        marker.key in values ||
        scan.text.slice(cursor, marker.start).trim()
      )
        this.fail(file, marker.line, '重复、未知或位置错误的标记');
      values[marker.key] = marker.value;
      cursor = scan.text.indexOf('\n', marker.start);
      cursor = cursor < 0 ? scan.text.length : cursor + 1;
    }
    for (const key of required) if (!(key in values)) this.fail(file, heading.line, `缺少 ${key}`);
    return { values, body: scan.text.slice(cursor, end).trim() };
  }
  parse(framework: string, materials: string): ParsedCourse {
    const f = this.scan(framework, 'framework.md', 'framework');
    const m = this.scan(materials, 'materials.md', 'materials');
    const nodes: FrameworkNode[] = [];
    const stack: Heading[] = [];
    f.headings.forEach((h, i) => {
      if (h.level > (stack.at(-1)?.level ?? 0) + 1)
        this.fail('framework.md', h.line, '标题层级不可跳跃');
      while (stack.length && stack.at(-1)!.level >= h.level) stack.pop();
      const parent = stack.at(-1);
      const parentNode = parent
        ? nodes.find((n) => n.position === f.headings.indexOf(parent))
        : null;
      if (parentNode?.type === 'lesson') this.fail('framework.md', h.line, 'lesson 必须为叶节点');
      const { values: v, body } = this.section(
        f,
        h,
        f.headings[i + 1]?.start ?? f.text.length,
        'framework.md',
        ['node_id', 'node_type', 'material_refs'],
      );
      if (!ID.test(v.node_id) || nodes.some((n) => n.id === v.node_id))
        this.fail('framework.md', h.line, '节点编号无效或重复');
      if (
        !['overview', 'section', 'lesson'].includes(v.node_type) ||
        (h.level === 1) !== (v.node_type === 'overview')
      )
        this.fail('framework.md', h.line, '节点类型无效');
      const refs =
        v.material_refs === 'none' ? [] : v.material_refs.split(',').map((x) => x.trim());
      if (
        refs.some((r) => !ID.test(r) || r === 'none') ||
        new Set(refs).size !== refs.length ||
        (v.node_type === 'lesson' && !refs.length)
      )
        this.fail('framework.md', h.line, '资料引用格式无效或 lesson 缺少资料');
      nodes.push({
        id: v.node_id,
        title: h.title,
        type: v.node_type as FrameworkNode['type'],
        parentId: parentNode?.id ?? null,
        position: i,
        body,
        refs,
      });
      stack.push(h);
    });
    if (!nodes.some((n) => n.type === 'lesson'))
      this.fail('framework.md', 1, '至少需要一个 lesson');
    const blocks: MaterialBlock[] = [];
    const blockHeads = m.headings.filter((h) => h.level === 2);
    if (m.markers.some((x) => x.start < (blockHeads[0]?.start ?? m.text.length)))
      this.fail('materials.md', 1, '资料标记必须位于二级块标题后');
    blockHeads.forEach((h, i) => {
      const { values: v, body } = this.section(
        m,
        h,
        blockHeads[i + 1]?.start ?? m.text.length,
        'materials.md',
        ['material_id'],
        ['source_ref'],
      );
      if (!ID.test(v.material_id) || blocks.some((b) => b.id === v.material_id))
        this.fail('materials.md', h.line, '资料编号无效或重复');
      if (!body.replace(/<!--.*?-->/gs, '').trim())
        this.fail('materials.md', h.line, '资料块不能为空');
      blocks.push({
        id: v.material_id,
        title: h.title,
        body,
        sourceRef: v.source_ref ?? '用户提供资料 / 具体位置未提供',
      });
    });
    for (const node of nodes)
      for (const ref of node.refs)
        if (!blocks.some((b) => b.id === ref))
          this.fail('framework.md', f.headings[node.position].line, `资料引用不存在：${ref}`);
    return { framework, materials, nodes, blocks };
  }
}
