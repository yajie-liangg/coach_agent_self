import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MarkdownImporter } from '../../apps/server/src/features/materials.js';
const framework = readFileSync('tests/fixtures/framework.md', 'utf8');
const materials = readFileSync('tests/fixtures/materials.md', 'utf8');
describe('Markdown 标注协议', () => {
  it('解析层级、lesson 和一对多引用，不修改源文', () => {
    const result = new MarkdownImporter().parse(framework, materials);
    expect(result.nodes.find((n) => n.id === 'real-needs')).toMatchObject({
      parentId: 'needs',
      type: 'lesson',
      refs: ['needs-definition', 'needs-example'],
    });
    expect(result.blocks).toHaveLength(3);
    expect(result.framework).toBe(framework);
  });
  it.each([
    ['重复节点', framework.replace('node_id: priority', 'node_id: real-needs'), materials],
    ['悬空引用', framework.replace('needs-example -->', 'missing -->'), materials],
    ['跳级标题', framework.replace('## 需求分析', '### 需求分析'), materials],
    ['空块', framework, materials.replace('需求、方案、交付和验证共同构成工作闭环。', '')],
    ['无效版本', framework.replace('coach_protocol: 1', 'coach_protocol: 2'), materials],
    ['无效编号', framework.replace('node_id: priority', 'node_id: BAD ID'), materials],
    [
      'lesson 无依据',
      framework.replace('material_refs: needs-definition, needs-example', 'material_refs: none'),
      materials,
    ],
    ['非叶 lesson', framework.replace('node_type: section', 'node_type: lesson'), materials],
    [
      '错误标记位置',
      framework.replace('整体目标：', '<!-- node_id: rogue -->\n整体目标：'),
      materials,
    ],
    ['重复资料', framework, materials.replace('material_id: needs-example', 'material_id: intro')],
  ])('拒绝%s并提供文件和行号', (_, f, m) => {
    expect(() => new MarkdownImporter().parse(f, m)).toThrow(/\.md:\d+/);
  });
  it('代码围栏里的标题和标记不参与解析', () => {
    const example = '\n```md\n## 错误的假标题\n<!-- material_id: intro -->\n```\n';
    expect(
      new MarkdownImporter().parse(framework + example, materials + example).nodes,
    ).toHaveLength(4);
  });
  it('标题改名后仍按 ID 引用', () => {
    expect(
      new MarkdownImporter().parse(framework.replace('识别真实需求', '新的标题'), materials)
        .nodes[2].refs,
    ).toContain('needs-example');
  });
});
