/* 只读任务清单（GFM - [x] / - [ ]）无障碍补丁：
   构建期为没有显式 label 的 disabled checkbox 注入本行文本作为 aria-label，
   消除读屏器与 Lighthouse 的孤立表单控件报错，不改动视觉结构。 */
export const taskA11y = {
  name: 'task-a11y',
  element: {
    filter: ['input'],
    visit(node, ctx) {
      if (node.properties?.type !== 'checkbox') return;
      if (node.properties?.['aria-label'] || node.properties?.ariaLabel) return;
      const parent = ctx.parent(node);
      const raw = (parent ? ctx.textContent(parent) : '').replace(/\s+/g, ' ').trim();
      const checked = node.properties?.checked !== undefined && node.properties?.checked !== false;
      const state = checked ? '已完成' : '未完成';
      ctx.setProperty(node, 'aria-label', raw ? `${state}：${raw}` : state);
    },
  },
};
