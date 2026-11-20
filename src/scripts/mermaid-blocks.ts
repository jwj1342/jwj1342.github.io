/**
 * Diagrams in blog posts. A post draws one with a fenced code block marked `mermaid`:
 *
 *   ```mermaid
 *   flowchart LR
 *     A[Visitor] --> B[wenjia.me]
 *   ```
 *
 * The blog page loads this file (and the Mermaid library, which is large) only when a
 * post contains such a block. Each block is replaced by the drawn diagram, in the site's
 * own colours and typeface, and drawn again when the light / dark theme changes. If the
 * script cannot run, the block simply stays readable as text.
 */
import mermaid from 'mermaid';

export async function start(blocks: HTMLElement[]) {
  const sources = blocks.map((block) => block.textContent ?? '');
  const figures = blocks.map((block) => {
    const figure = document.createElement('figure');
    figure.className = 'diagram';
    return { block, figure };
  });

  let run = 0;
  async function draw() {
    run++;
    const style = getComputedStyle(document.documentElement);
    const token = (name: string) => style.getPropertyValue(name).trim();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: token('--sans'),
      flowchart: { curve: 'basis', padding: 14, nodeSpacing: 36, rankSpacing: 46, htmlLabels: true },
      themeVariables: {
        fontSize: '14px',
        background: token('--bg'),
        primaryColor: token('--surface'),
        primaryTextColor: token('--ink'),
        primaryBorderColor: token('--accent'),
        secondaryColor: token('--accent-soft'),
        secondaryTextColor: token('--ink'),
        secondaryBorderColor: token('--line'),
        tertiaryColor: token('--code-bg'),
        tertiaryTextColor: token('--ink'),
        tertiaryBorderColor: token('--line'),
        lineColor: token('--muted'),
        textColor: token('--ink'),
        mainBkg: token('--surface'),
        nodeBorder: token('--accent'),
        clusterBkg: token('--code-bg'),
        clusterBorder: token('--line'),
        titleColor: token('--muted'),
        edgeLabelBackground: token('--bg'),
      },
    });
    for (let i = 0; i < figures.length; i++) {
      const { block, figure } = figures[i];
      try {
        const { svg } = await mermaid.render(`diagram-${i}-${run}`, sources[i]);
        figure.innerHTML = svg;
        if (block.isConnected) block.replaceWith(figure);
      } catch (error) {
        console.error(error); // a diagram with a mistake in it stays as its source text
      }
    }
  }

  await document.fonts.ready; // labels are measured, so the typeface must be there first
  await draw();
  // follow the site's light / dark switch
  new MutationObserver(() => void draw()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => void draw());
}
