import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvalBar } from './EvalBar';

describe('EvalBar', () => {
  it('shows White POV scores with a German accessible label', () => {
    render(<EvalBar score={{ type: 'cp', value: 130 }} orientation="white" />);
    const bar = screen.getByRole('img', { name: 'Bewertung: Weiß steht besser (+1,3)' });
    expect(Number(bar.getAttribute('data-share'))).toBeGreaterThan(50);
    expect(bar).toHaveTextContent('+1,3');
  });

  it('shows mate as "M3" and fills the bar completely', () => {
    render(<EvalBar score={{ type: 'mate', value: 3 }} orientation="white" />);
    const bar = screen.getByRole('img', { name: 'Bewertung: Weiß setzt in 3 Zügen matt (M3)' });
    expect(bar).toHaveAttribute('data-share', '100');
  });

  it('puts White at the top when the board is flipped', () => {
    const { container } = render(<EvalBar score={{ type: 'cp', value: -80 }} orientation="black" />);
    const fill = container.querySelector('[data-testid="eval-bar"] > div') as HTMLElement;
    expect(fill.style.top).toBe('0px');
    expect(screen.getByRole('img')).toHaveAccessibleName('Bewertung: Schwarz steht etwas besser (−0,8)');
  });

  it('is a thin bar without a number on phones and neutral while unknown', () => {
    render(<EvalBar score={null} orientation="white" direction="horizontal" />);
    const bar = screen.getByRole('img', { name: 'Bewertung: Die Stellung ist ausgeglichen (0,0)' });
    expect(bar).toHaveAttribute('data-share', '50');
    expect(bar).toHaveTextContent('');
  });
});
