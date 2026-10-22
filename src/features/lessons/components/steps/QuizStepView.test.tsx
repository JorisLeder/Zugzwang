import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { QuizStep } from '@/lessons';
import { LESSON_TIMINGS } from './stepTypes';
import { QuizStepView } from './QuizStepView';

const STEP: QuizStep = {
  id: 'q1',
  type: 'quiz',
  questionDe: 'Welche Antwort stimmt?',
  options: [
    { id: 'richtig', textDe: 'Richtig', correct: true, feedbackDe: 'Genau.' },
    { id: 'falsch-1', textDe: 'Falsch eins', correct: false, feedbackDe: 'Nein eins.' },
    { id: 'falsch-2', textDe: 'Falsch zwei', correct: false, feedbackDe: 'Nein zwei.' },
    { id: 'falsch-3', textDe: 'Falsch drei', correct: false, feedbackDe: 'Nein drei.' },
  ],
} as QuizStep;

function renderQuiz(seed: string, handlers = { onComplete: vi.fn(), onMistake: vi.fn() }) {
  const view = render(
    <QuizStepView
      step={STEP}
      active
      completed={false}
      onHint={() => {}}
      frame={({ panel }) => <div>{panel}</div>}
      timings={LESSON_TIMINGS}
      seed={seed}
      {...handlers}
    />,
  );
  const order = () => [...view.container.querySelectorAll('[data-option-id]')].map((b) => b.getAttribute('data-option-id'));
  return { ...view, order, ...handlers };
}

describe('QuizStepView option order (LC2-1)', () => {
  it('does not always list the correct option first', () => {
    const firsts = new Set<string | null>();
    for (let i = 0; i < 40; i++) {
      const { order, unmount } = renderQuiz(`seed-${i}`);
      firsts.add(order()[0]!);
      unmount();
    }
    expect(firsts.size).toBeGreaterThan(1);
    expect([...firsts].some((id) => id !== 'richtig')).toBe(true);
  });

  it('keeps the order across re-renders and answers, and can differ for another seed', () => {
    const { order, rerender, onMistake } = renderQuiz('seed-a');
    const before = order();
    fireEvent.click(screen.getByRole('button', { name: 'Falsch zwei' }));
    expect(onMistake).toHaveBeenCalledTimes(1);
    expect(order()).toEqual(before);
    rerender(
      <QuizStepView step={STEP} active completed={false} onHint={() => {}} onComplete={() => {}} onMistake={() => {}} frame={({ panel }) => <div>{panel}</div>} timings={LESSON_TIMINGS} seed="seed-a" />,
    );
    expect(order()).toEqual(before);
    const orders = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const r = renderQuiz(`other-${i}`);
      orders.add(r.order().join());
      r.unmount();
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('maps feedback and scoring to the chosen option, wherever it is shown', () => {
    for (const seed of ['s1', 's2', 's3', 's4']) {
      const { onComplete, onMistake, unmount } = renderQuiz(seed);
      fireEvent.click(screen.getByRole('button', { name: 'Falsch drei' }));
      expect(screen.getByTestId('quiz-feedback')).toHaveTextContent('Nein drei.');
      expect(onMistake).toHaveBeenCalledTimes(1);
      expect(onComplete).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Richtig' }));
      expect(screen.getByTestId('quiz-feedback')).toHaveTextContent('Genau.');
      expect(onComplete).toHaveBeenCalledTimes(1);
      unmount();
    }
  });
});
