import { describe, expect, it } from 'vitest';
import { checkQuizOptionOrder } from './lessons';

const quiz = (correctIndex: number, n = 3) => ({
  type: 'quiz',
  options: Array.from({ length: n }, (_, i) => ({ correct: i === correctIndex })),
});

describe('quiz option order check (LC2-1)', () => {
  it('warns when more than 60 % of the quizzes list the correct option first', () => {
    const issues = checkQuizOptionOrder({ steps: [{ type: 'explanation' }, quiz(0), quiz(0), quiz(0), quiz(1)] });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('3 von 4');
  });

  it('is quiet for mixed positions, exactly 60 %, and lessons without quizzes', () => {
    expect(checkQuizOptionOrder({ steps: [quiz(0), quiz(2), quiz(1), quiz(1)] })).toEqual([]);
    expect(checkQuizOptionOrder({ steps: [quiz(0), quiz(0), quiz(0), quiz(1), quiz(2)] })).toEqual([]);
    expect(checkQuizOptionOrder({ steps: [{ type: 'explanation' }] })).toEqual([]);
  });
});
