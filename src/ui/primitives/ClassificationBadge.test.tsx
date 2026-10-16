import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CLASSIFICATION_META, MOVE_CLASSIFICATIONS } from '@/core/analysis';
import { ClassificationBadge } from './ClassificationBadge';

describe.each(['dark', 'light'] as const)('ClassificationBadge (%s)', (theme) => {
  it('renders every category with label, symbol/icon and token colours', () => {
    if (theme === 'light') document.documentElement.dataset.theme = 'light';
    render(
      <div>
        {MOVE_CLASSIFICATIONS.map((c) => (
          <ClassificationBadge key={c} classification={c} size={24} />
        ))}
      </div>,
    );
    for (const c of MOVE_CLASSIFICATIONS) {
      const meta = CLASSIFICATION_META[c];
      const badge = screen.getByRole('img', { name: meta.labelDe });
      expect(badge).toHaveAttribute('data-classification', c);
      expect(badge.getAttribute('style')).toContain(`var(${meta.fillVar})`);
      expect(badge.getAttribute('style')).toContain(`var(${meta.inkVar})`);
      if (meta.symbol) expect(badge).toHaveTextContent(meta.symbol);
      else expect(badge.querySelector('svg')).not.toBeNull();
    }
  });

  it('shows the label next to the badge and the plain meaning as tooltip', () => {
    if (theme === 'light') document.documentElement.dataset.theme = 'light';
    render(<ClassificationBadge classification="blunder" showLabel showPlainTooltip />);
    expect(screen.getByText('Patzer')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Patzer' })).toHaveAttribute('title', `Patzer: ${CLASSIFICATION_META.blunder.plainDe}`);
  });
});
