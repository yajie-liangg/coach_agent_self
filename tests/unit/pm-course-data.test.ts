import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MarkdownImporter } from '../../apps/server/src/features/materials.js';

describe('产品经理跨书课程数据', () => {
  it('可按标注协议导入全部骨架节点和中间层资料', () => {
    const framework = readFileSync('PM_data/framework.md', 'utf8');
    const materials = readFileSync('PM_data/materials.md', 'utf8');

    const parsed = new MarkdownImporter().parse(framework, materials);

    expect(parsed.nodes).toHaveLength(44);
    expect(parsed.nodes.filter((node) => node.type === 'lesson')).toHaveLength(36);
    expect(parsed.blocks).toHaveLength(37);
    expect(parsed.nodes[0]).toMatchObject({
      id: 'overview',
      type: 'overview',
      refs: ['pm-overview'],
    });
    expect(parsed.nodes.at(-1)).toMatchObject({
      id: 'interview-development',
      refs: ['interview-development'],
    });
  });
});
