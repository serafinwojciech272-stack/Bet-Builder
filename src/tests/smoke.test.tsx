// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import App from '../App';

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean | undefined; }
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(path: string) {
  window.history.pushState({}, '', path);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<App />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 8000)); });
  return { container, root };
}

describe('application smoke tests', () => {
  it('boots the shell and renders every dashboard section', async () => {
    const { container, root } = await mount('/');
    const text = container.textContent ?? '';
    for (const section of ['Bet Builder', 'Intelligence Dashboard', 'Monitored events', 'Notable odds movements', 'Value signals', 'Quality alerts', 'Risk alerts', 'Awaiting approval', 'Historical outcomes']) expect(text).toContain(section);
    root.unmount();
  }, 25_000);

  it('renders the nine analysis sections for an event', async () => {
    const { container, root } = await mount('/analysis/EVT-SOC-1001');
    const text = container.textContent ?? '';
    for (const section of ['Event overview', 'Market intelligence', 'Odds movement', 'Model probabilities', 'Value analysis', 'Risk & correlation', 'AI reasoning', 'Recommended actions', 'Mission creation']) expect(text).toContain(section);
    expect(text).toContain('AI inference'); root.unmount();
  }, 25_000);

  it('renders mission control and the history views', async () => {
    const missions = await mount('/missions'); expect(missions.container.textContent).toContain('Mission control'); expect(missions.container.textContent).toContain('AWAITING APPROVAL'); missions.root.unmount();
    const history = await mount('/history'); expect(history.container.textContent).toContain('History & calibration'); expect(history.container.textContent).toContain('Analysis history'); history.root.unmount();
  }, 30_000);
});
