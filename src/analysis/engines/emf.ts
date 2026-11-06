import type { Engine } from '../engine';
import { solveCircuit } from './circuit';
import { mutualImpedance } from '../emf';

// Same circuit model as Lawson, but every self and mutual impedance is the
// exact induced-EMF integral for the actual element lengths and radius
// (sinusoidal current assumed), instead of half-wave tables and fits.

export const emfEngine: Engine = {
  id: 'emf',
  label: 'Induced EMF',
  solve: (design, frequency) => solveCircuit({
    impedance(d, i, j, lambda) {
      const k = (2 * Math.PI) / lambda, a = d.diameter / 2;
      const ei = d.elements[i]!, ej = d.elements[j]!;
      return mutualImpedance(k, ei.length / 2, ej.length / 2, i === j ? a : Math.max(Math.abs(ei.x - ej.x), a));
    },
    // centre current → current maximum of the sinusoid
    patternScale: (l) => 1 / Math.sin(Math.PI * l),
  }, design, frequency),
};
