export type CorrelationPair = {
  suspicion_score: number;
  exam_score: number;
};

export type CorrelationResult =
  | {
      pairs: CorrelationPair[];
      regressionLine: null;
      insufficientData: true;
    }
  | {
      slope: number;
      intercept: number;
      r: number;
      r_squared: number;
      p_value: number;
      pairs: CorrelationPair[];
      regressionLine: Array<{ suspicion: number; performance: number }>;
      insufficientData: false;
    };

// Lanczos approximation. This keeps correlation independent of the Python
// service while retaining its two-sided Student-t p-value.
function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (value < 0.5)
    return (
      Math.log(Math.PI) -
      Math.log(Math.sin(Math.PI * value)) -
      logGamma(1 - value)
    );

  const shifted = value - 1;
  let series = 0.9999999999998099;
  coefficients.forEach((coefficient, index) => {
    series += coefficient / (shifted + index + 1);
  });
  const t = shifted + coefficients.length - 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (shifted + 0.5) * Math.log(t) -
    t +
    Math.log(series)
  );
}

function betaContinuedFraction(a: number, b: number, x: number) {
  const maxIterations = 200;
  const epsilon = 3e-14;
  const floor = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < floor) d = floor;
  d = 1 / d;
  let result = d;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const doubled = 2 * iteration;
    let numerator =
      (iteration * (b - iteration) * x) / ((qam + doubled) * (a + doubled));
    d = 1 + numerator * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + numerator / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    result *= d * c;

    numerator =
      (-(a + iteration) * (qab + iteration) * x) /
      ((a + doubled) * (qap + doubled));
    d = 1 + numerator * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + numerator / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return result;
}

function regularizedIncompleteBeta(x: number, a: number, b: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log1p(-x)
  );
  return x < (a + 1) / (a + b + 2)
    ? (factor * betaContinuedFraction(a, b, x)) / a
    : 1 - (factor * betaContinuedFraction(b, a, 1 - x)) / b;
}

function twoSidedPValue(r: number, sampleSize: number) {
  if (sampleSize === 2) return Math.abs(r) === 1 ? 0 : 1;
  if (Math.abs(r) >= 1) return 0;
  const degreesOfFreedom = sampleSize - 2;
  const tSquared = (r * r * degreesOfFreedom) / (1 - r * r);
  return regularizedIncompleteBeta(
    degreesOfFreedom / (degreesOfFreedom + tSquared),
    degreesOfFreedom / 2,
    0.5
  );
}

export function calculateCorrelation(
  pairs: CorrelationPair[]
): CorrelationResult {
  if (
    pairs.length < 2 ||
    new Set(pairs.map((pair) => pair.suspicion_score)).size < 2
  ) {
    return { pairs, regressionLine: null, insufficientData: true };
  }

  const count = pairs.length;
  const meanX =
    pairs.reduce((sum, pair) => sum + pair.suspicion_score, 0) / count;
  const meanY = pairs.reduce((sum, pair) => sum + pair.exam_score, 0) / count;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  pairs.forEach((pair) => {
    const x = pair.suspicion_score - meanX;
    const y = pair.exam_score - meanY;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
  });

  const slope = sumXY / sumXX;
  const intercept = meanY - slope * meanX;
  const rawR = sumYY === 0 ? 0 : sumXY / Math.sqrt(sumXX * sumYY);
  const r = Math.max(-1, Math.min(1, rawR));
  return {
    slope,
    intercept,
    r,
    r_squared: r * r,
    p_value: sumYY === 0 ? 1 : twoSidedPValue(r, count),
    pairs,
    regressionLine: [
      { suspicion: 0, performance: intercept },
      { suspicion: 100, performance: intercept + slope * 100 },
    ],
    insufficientData: false,
  };
}
