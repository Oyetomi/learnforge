import type { DerivationLadderProps } from '../../DerivationLadder';

/** Explicit grouping avoids the ambiguous 6 ÷ 2(1 + 2) notation. */
export const MATH_SIMPLIFY_LADDER: DerivationLadderProps = {
  title: 'Simplify expression',
  initialState: '$6 \\div \\bigl[2(1+2)\\bigr]$',
  steps: [
    {
      rule: 'Write the division as a fraction',
      evalText: '$6 \\div \\bigl[2(1+2)\\bigr] = \\frac{6}{2(1+2)}$',
      state: '$\\frac{6}{2(\\textcolor{#78aed0}{1+2})}$',
      color: 'orange',
    },
    {
      rule: 'Add the numbers in parentheses',
      evalText: '$1+2=3$',
      state: '$\\frac{6}{2\\times\\textcolor{#78aed0}{\\boxed{3}}}$',
      color: 'blue',
    },
    {
      rule: 'Multiply the numbers in the denominator',
      evalText: '$2\\times3=6$',
      state: '$\\frac{\\textcolor{#d18b70}{6}}{\\textcolor{#8bbf92}{\\boxed{6}}}$',
      color: 'green',
    },
    {
      rule: 'Divide the numerator by the denominator',
      evalText: '$\\frac{6}{6}=1$',
      state: '$\\textcolor{#d18b70}{\\boxed{1}}$',
      color: 'orange',
    },
  ],
  result: '$1$',
};
