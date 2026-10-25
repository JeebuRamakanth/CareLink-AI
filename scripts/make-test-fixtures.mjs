#!/usr/bin/env node
/**
 * CareLink-AI — synthetic medical-document fixtures for automated tests.
 *
 * Generates DE-IDENTIFIED, obviously-synthetic documents with a real PDF text
 * layer so the extraction pipeline can be exercised without any real patient
 * data. Every fixture is labelled as a test fixture inside its own content.
 *
 * Usage: node scripts/make-test-fixtures.mjs [outDir]
 * Default outDir: /tmp
 *
 * These files are TEST DATA ONLY and must never be shipped to users.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] || '/tmp';
mkdirSync(outDir, { recursive: true });

/** Build a minimal, valid PDF whose content stream holds a real text layer. */
function buildPdf(lines, { fontSize = 10 } = {}) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = `BT /F1 ${fontSize} Tf 40 780 Td 14 TL\n` + lines.map((l) => `(${esc(l)}) Tj T*`).join('\n') + '\nET';
  const contentBytes = Buffer.from(content, 'latin1');

  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'),
    Buffer.concat([Buffer.from(`<< /Length ${contentBytes.length} >>\nstream\n`), contentBytes, Buffer.from('\nendstream')]),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ];

  const out = [Buffer.from('%PDF-1.4\n')];
  const offsets = [];
  let length = out[0].length;
  objects.forEach((obj, i) => {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), obj, Buffer.from('\nendobj\n')]);
    out.push(chunk);
    length += chunk.length;
  });
  const xrefOffset = length;
  const xref = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ']
    .concat(offsets.map((off) => `${String(off).padStart(10, '0')} 00000 n `))
    .join('\n');
  out.push(Buffer.from(`${xref}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
  return Buffer.concat(out);
}

/* ---------------------------------------------------------------------------
 * Fixtures — all synthetic, all explicitly labelled
 * ------------------------------------------------------------------------- */

const LAB_REPORT = [
  'CITY DIAGNOSTIC LABORATORY (SYNTHETIC TEST FIXTURE)',
  'Patient: TEST FIXTURE — NOT A REAL PATIENT',
  'Report Date: 12/03/2025',
  '',
  'Test Name                 Result     Unit        Reference Range      Flag',
  'Hemoglobin                11.2       g/dL        13.0 - 17.0          L',
  'Total Leucocyte Count     9800       /cumm       4000 - 11000         N',
  'Platelet Count            145        10^3/uL     150 - 410            L',
  'Fasting Blood Sugar       132        mg/dL       70 - 99              H',
  'HbA1c                     7.4        %           4.0 - 5.6            H',
  'Total Cholesterol         210        mg/dL       0 - 200              H',
  'Serum Creatinine          1.0        mg/dL       0.7 - 1.3            N',
  'Potassium                 6.9        mmol/L      3.5 - 5.1            H',
];

const NORMAL_LAB_REPORT = [
  'CITY DIAGNOSTIC LABORATORY (SYNTHETIC TEST FIXTURE)',
  'Patient: TEST FIXTURE — NOT A REAL PATIENT',
  'Report Date: 02/01/2025',
  '',
  'Test Name                 Result     Unit        Reference Range      Flag',
  'Hemoglobin                14.2       g/dL        13.0 - 17.0          N',
  'Total Leucocyte Count     7200       /cumm       4000 - 11000         N',
  'Platelet Count            240        10^3/uL     150 - 410            N',
  'Fasting Blood Sugar       92         mg/dL       70 - 99              N',
];

const PRESCRIPTION = [
  'CITY CARE CLINIC (SYNTHETIC TEST FIXTURE)',
  'Dr. Test Fixture MBBS',
  'Date: 12/03/2025',
  'Rx',
  'Tab Metformin 500 mg BD after food x 30 days',
  'Tab Amoxicillin 500 mg TDS after food for 5 days',
  'Cap Omeprazole 20 mg OD before food',
  'Review after 2 weeks',
];

const MEDICINE_LABEL = [
  'DOLO 650',
  'Each film-coated tablet contains:',
  'Paracetamol 650 mg',
  'Mfg by Test Pharma Ltd',
  'Batch No: TEST123',
  'Exp Date: 12/2027',
];

const fixtures = [
  { name: 'lab-report-test.pdf', lines: LAB_REPORT },
  { name: 'lab-report-normal-test.pdf', lines: NORMAL_LAB_REPORT },
  { name: 'prescription-test.pdf', lines: PRESCRIPTION },
  { name: 'medicine-label-test.pdf', lines: MEDICINE_LABEL },
];

for (const fixture of fixtures) {
  const path = join(outDir, fixture.name);
  writeFileSync(path, buildPdf(fixture.lines));
  console.log(`wrote ${path}`);
}

console.log('\nThese are SYNTHETIC test fixtures. Do not ship them to users.');
