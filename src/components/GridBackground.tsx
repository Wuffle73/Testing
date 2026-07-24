import React from 'react';
import Svg, { Line, Rect } from 'react-native-svg';

import { colors } from '../theme/theme';

interface GridBackgroundProps {
  width: number;
  height: number;
  /** Approximate spacing between grid lines in px. */
  step?: number;
}

/**
 * A blank graph-paper style canvas drawn with react-native-svg, used as the
 * floor-map background when the landlord hasn't uploaded a floor-plan photo.
 * It's a visual index for placing room pins, not an architectural drawing.
 */
export function GridBackground({ width, height, step = 32 }: GridBackgroundProps) {
  if (width <= 0 || height <= 0) return null;

  const verticals: number[] = [];
  for (let x = step; x < width; x += step) verticals.push(x);
  const horizontals: number[] = [];
  for (let y = step; y < height; y += step) horizontals.push(y);

  return (
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} fill={colors.surfaceAlt} />
      {verticals.map((x) => (
        <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} stroke={colors.border} strokeWidth={1} />
      ))}
      {horizontals.map((y) => (
        <Line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} stroke={colors.border} strokeWidth={1} />
      ))}
    </Svg>
  );
}
