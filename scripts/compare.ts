// Run every reference design from Lawson's book through all three engines.
//   npm run compare
import { analyze, ENGINES } from '../src/analysis/analyze';
import { solveMom } from '../src/analysis/engines/mom';
import { NBS_DESIGNS, PREFERRED_DESIGNS, type ReferenceDesign, referenceToDesign as toDesign } from '../src/data/lawson';
import { C0 } from '../src/model';

const f1 = (v: number) => v.toFixed(1).padStart(6);
const z = (c: { re: number; im: number }) => `${c.re.toFixed(1)}${c.im < 0 ? '−' : '+'}j${Math.abs(c.im).toFixed(1)}`.padStart(14);

function table(title: string, designs: ReferenceDesign[]) {
  console.log(`\n${title}`);
  console.log('design               | book G  F/B | Lawson G  F/B          Zin | EMF G  F/B          Zin | MoM G  F/B          Zin |  NBS meas  NBS patt');
  for (const r of designs) {
    const d = toDesign(r);
    const [L, E, M] = (['lawson', 'emf', 'mom'] as const).map((id) => analyze(d, ENGINES[id]));
    console.log(`${r.name.padEnd(20)} | ${f1(r.lawson.gainDbi)} ${r.lawson.frontToBackDb ? f1(r.lawson.frontToBackDb) : '     -'} |`
      + `${f1(L!.gainDbi)} ${f1(L!.frontToBackDb)} ${z(L!.zIn)} |${f1(E!.gainDbi)} ${f1(E!.frontToBackDb)} ${z(E!.zIn)} |${f1(M!.gainDbi)} ${f1(M!.frontToBackDb)} ${z(M!.zIn)} |`
      + `  ${r.nbsMeasuredDbi ? f1(r.nbsMeasuredDbi) : '     -'}    ${r.nbsPatternDbi ? f1(r.nbsPatternDbi) : '     -'}`);
  }
}

table('NBS TN 688 designs (Lawson Tables 1.4/1.5), radius 0.00425 λ', NBS_DESIGNS);
table('Lawson preferred designs (Table 7.1), radius 0.000526 λ', PREFERRED_DESIGNS);

console.log('\nMoM convergence (segments per element), Lawson 3 el:');
const d3 = toDesign(PREFERRED_DESIGNS[1]!);
for (const seg of [10, 20, 30, 50, 80, 120]) {
  const s = solveMom(d3, C0, { segments: seg });
  const g = 10 * Math.log10(s.directivity([1, 0, 0])), b = 10 * Math.log10(s.directivity([-1, 0, 0]));
  console.log(`  ${String(seg).padStart(3)} seg: G ${g.toFixed(2)} dBi  F/B ${(g - b).toFixed(1)} dB  Zin ${z(s.zIn)}`);
}
