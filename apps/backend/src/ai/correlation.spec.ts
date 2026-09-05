import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateCorrelation } from './correlation';

describe('calculateCorrelation', () => {
  it('returns insufficient data with fewer than two distinct x values', () => {
    assert.deepEqual(calculateCorrelation([]), {
      pairs: [],
      regressionLine: null,
      insufficientData: true,
    });
    assert.equal(
      calculateCorrelation([
        { suspicion_score: 10, exam_score: 70 },
        { suspicion_score: 10, exam_score: 80 },
      ]).insufficientData,
      true
    );
  });

  it('calculates a perfect negative relationship', () => {
    const result = calculateCorrelation([
      { suspicion_score: 0, exam_score: 100 },
      { suspicion_score: 50, exam_score: 50 },
      { suspicion_score: 100, exam_score: 0 },
    ]);
    assert.equal(result.insufficientData, false);
    if (result.insufficientData) return;
    assert.equal(result.slope, -1);
    assert.equal(result.intercept, 100);
    assert.equal(result.r, -1);
    assert.equal(result.r_squared, 1);
    assert.equal(result.p_value, 0);
  });

  it('matches a known linear-regression result', () => {
    const result = calculateCorrelation([
      { suspicion_score: 10, exam_score: 82 },
      { suspicion_score: 20, exam_score: 75 },
      { suspicion_score: 35, exam_score: 71 },
      { suspicion_score: 50, exam_score: 60 },
      { suspicion_score: 80, exam_score: 49 },
    ]);
    assert.equal(result.insufficientData, false);
    if (result.insufficientData) return;
    assert.ok(Math.abs(result.slope - -0.46953642384105965) < 1e-12);
    assert.ok(Math.abs(result.r - -0.9915492369315966) < 1e-12);
    assert.ok(Math.abs(result.p_value - 0.0009313790441472749) < 1e-12);
  });
});
