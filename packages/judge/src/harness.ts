/**
 * Function-mode harness (the LeetCode-style question type).
 *
 * The student writes only a function body. The judge assembles a full
 * translation unit around it:
 *
 *     #line 1 "harness.c"
 *     <header: includes, structs, typedefs>
 *     #line 1 "solution.c"
 *     <student code>
 *     #line 1 "driver.c"
 *     <driver: main() that parses stdin, calls the function, prints the result>
 *
 * The `#line` directives are what make this usable. Without them a student who
 * misses a semicolon on their line 3 gets told "error on line 47" — a line they
 * cannot see and did not write. With them, gcc reports `solution.c:3` and the
 * number matches their editor exactly.
 *
 * They also make it trivial to tell whose fault a compile error is: anything
 * reported outside `solution.c` is the teacher's driver misbehaving, not the
 * student's submission, and is reported as such rather than dumped on a
 * confused beginner.
 */

import type { SourceProgram } from './types.ts';
import { stripNonCode } from './restrictions.ts';

export const STUDENT_FILE = 'solution.c';
export const HEADER_FILE = 'harness.c';
export const DRIVER_FILE = 'driver.c';

/** Parameter and return types the driver generator understands. */
export type ValueType =
  | 'int'
  | 'long'
  | 'double'
  | 'char'
  | 'bool'
  | 'string' // one whitespace-delimited token
  | 'line' // the remainder of a line, spaces included
  | 'int[]'
  | 'long[]'
  | 'double[]'
  | 'string[]'
  | 'int[][]';

export interface Parameter {
  name: string;
  type: ValueType;
}

export interface FunctionSignature {
  name: string;
  returnType: ValueType;
  params: Parameter[];
}

export interface AssembleOptions {
  header: string;
  studentCode: string;
  driver: string;
}

export class MainNotAllowedError extends Error {
  constructor() {
    super(
      'Your submission defines main(). For this question, write only the function body — ' +
        'the judge supplies main() for you.',
    );
    this.name = 'MainNotAllowedError';
  }
}

/**
 * Rejects submissions that define `main`, which would collide with the driver's
 * own and produce a duplicate-symbol link error that means nothing to a student.
 *
 * Comments and string literals are stripped first so that a `main` mentioned in
 * a comment, or `printf("main")`, is not a false positive.
 */
export function definesMain(code: string): boolean {
  return /(^|[^\w])main\s*\(/.test(stripNonCode(code));
}

/**
 * Assembles the three regions into one translation unit and returns a line
 * mapper that translates gcc diagnostics back to the student's editor.
 */
export function assembleFunctionProgram(options: AssembleOptions): SourceProgram {
  if (definesMain(options.studentCode)) {
    throw new MainNotAllowedError();
  }

  const header = options.header.replace(/\s*$/, '');
  const student = options.studentCode.replace(/\s*$/, '');
  const driver = options.driver.replace(/\s*$/, '');

  const source = [
    `#line 1 "${HEADER_FILE}"`,
    header,
    `#line 1 "${STUDENT_FILE}"`,
    student,
    `#line 1 "${DRIVER_FILE}"`,
    driver,
    '',
  ].join('\n');

  return {
    source,
    mapLine: (reportedFile, reportedLine) => {
      // Diagnostics already carry student-relative numbers thanks to #line;
      // everything else belongs to the harness and is not the student's to see.
      const base = reportedFile.split('/').pop() ?? reportedFile;
      return base === STUDENT_FILE ? reportedLine : null;
    },
  };
}

// --- Driver generation -------------------------------------------------------

interface TypeSpec {
  /** C type as it appears in the function signature. */
  cType: string;
  /** Emits statements that read this parameter from stdin into `name`. */
  read: (name: string) => string[];
  /** Emits statements printing a value of this type. */
  print: (expr: string) => string[];
  /** Extra parameters the signature needs, e.g. an array length. */
  extraParams?: (name: string) => Parameter[];
  /** Statements freeing anything `read` allocated. */
  free?: (name: string) => string[];
}

const SCALAR_READS: Record<string, { cType: string; fmt: string; print: string }> = {
  int: { cType: 'int', fmt: '%d', print: '%d' },
  long: { cType: 'long long', fmt: '%lld', print: '%lld' },
  double: { cType: 'double', fmt: '%lf', print: '%.6f' },
  char: { cType: 'char', fmt: ' %c', print: '%c' },
};

function arraySpec(element: 'int' | 'long' | 'double'): TypeSpec {
  const { cType, fmt, print } = SCALAR_READS[element]!;
  return {
    cType: `${cType}*`,
    extraParams: (name) => [{ name: `${name}Size`, type: 'int' }],
    read: (name) => [
      `int ${name}Size = read_int();`,
      `${cType}* ${name} = malloc(sizeof(${cType}) * (${name}Size > 0 ? ${name}Size : 1));`,
      `if (!${name}) return 3;`,
      `for (int i = 0; i < ${name}Size; i++) {`,
      `  if (scanf("${fmt}", &${name}[i]) != 1) return 2;`,
      `}`,
    ],
    print: (expr) => [
      `printf("%d\\n", ${expr}Size);`,
      `for (int i = 0; i < ${expr}Size; i++) {`,
      `  printf("${print}%s", ${expr}[i], i + 1 < ${expr}Size ? " " : "\\n");`,
      `}`,
      `if (${expr}Size == 0) printf("\\n");`,
    ],
    free: (name) => [`free(${name});`],
  };
}

const TYPE_SPECS: Record<ValueType, TypeSpec> = {
  int: {
    cType: 'int',
    read: (n) => [`int ${n} = read_int();`],
    print: (e) => [`printf("%d\\n", ${e});`],
  },
  long: {
    cType: 'long long',
    read: (n) => [`long long ${n}; if (scanf("%lld", &${n}) != 1) return 2;`],
    print: (e) => [`printf("%lld\\n", ${e});`],
  },
  double: {
    cType: 'double',
    read: (n) => [`double ${n}; if (scanf("%lf", &${n}) != 1) return 2;`],
    print: (e) => [`printf("%.6f\\n", ${e});`],
  },
  char: {
    cType: 'char',
    read: (n) => [`char ${n}; if (scanf(" %c", &${n}) != 1) return 2;`],
    print: (e) => [`printf("%c\\n", ${e});`],
  },
  bool: {
    cType: 'int',
    read: (n) => [`int ${n} = read_int();`],
    print: (e) => [`printf("%s\\n", (${e}) ? "true" : "false");`],
  },
  string: {
    cType: 'char*',
    read: (n) => [`char* ${n} = read_token();`, `if (!${n}) return 2;`],
    print: (e) => [`printf("%s\\n", ${e} ? ${e} : "");`],
    free: (n) => [`free(${n});`],
  },
  line: {
    cType: 'char*',
    read: (n) => [`char* ${n} = read_line();`, `if (!${n}) return 2;`],
    print: (e) => [`printf("%s\\n", ${e} ? ${e} : "");`],
    free: (n) => [`free(${n});`],
  },
  'int[]': arraySpec('int'),
  'long[]': arraySpec('long'),
  'double[]': arraySpec('double'),
  'string[]': {
    cType: 'char**',
    extraParams: (name) => [{ name: `${name}Size`, type: 'int' }],
    read: (name) => [
      `int ${name}Size = read_int();`,
      `char** ${name} = malloc(sizeof(char*) * (${name}Size > 0 ? ${name}Size : 1));`,
      `if (!${name}) return 3;`,
      `for (int i = 0; i < ${name}Size; i++) {`,
      `  ${name}[i] = read_token();`,
      `  if (!${name}[i]) return 2;`,
      `}`,
    ],
    print: (expr) => [
      `printf("%d\\n", ${expr}Size);`,
      `for (int i = 0; i < ${expr}Size; i++) printf("%s\\n", ${expr}[i]);`,
    ],
    free: (name) => [
      `for (int i = 0; i < ${name}Size; i++) free(${name}[i]);`,
      `free(${name});`,
    ],
  },
  'int[][]': {
    cType: 'int**',
    extraParams: (name) => [
      { name: `${name}Rows`, type: 'int' },
      { name: `${name}Cols`, type: 'int' },
    ],
    read: (name) => [
      `int ${name}Rows = read_int();`,
      `int ${name}Cols = read_int();`,
      `int** ${name} = malloc(sizeof(int*) * (${name}Rows > 0 ? ${name}Rows : 1));`,
      `if (!${name}) return 3;`,
      `for (int i = 0; i < ${name}Rows; i++) {`,
      `  ${name}[i] = malloc(sizeof(int) * (${name}Cols > 0 ? ${name}Cols : 1));`,
      `  if (!${name}[i]) return 3;`,
      `  for (int j = 0; j < ${name}Cols; j++) {`,
      `    if (scanf("%d", &${name}[i][j]) != 1) return 2;`,
      `  }`,
      `}`,
    ],
    print: () => [`/* 2D returns are not supported; use a manual driver */`],
    free: (name) => [
      `for (int i = 0; i < ${name}Rows; i++) free(${name}[i]);`,
      `free(${name});`,
    ],
  },
};

/** Return types the generator can print. Anything else needs a manual driver. */
const RETURNABLE: ReadonlySet<ValueType> = new Set<ValueType>([
  'int',
  'long',
  'double',
  'char',
  'bool',
  'string',
  'line',
  'int[]',
  'long[]',
  'double[]',
  'string[]',
]);

export class UnsupportedSignatureError extends Error {
  constructor(message: string) {
    super(`${message} Use the manual driver option for this question.`);
    this.name = 'UnsupportedSignatureError';
  }
}

/** Renders the C declaration of the student's function, e.g. `int* twoSum(int* nums, int numsSize)`. */
export function renderSignature(signature: FunctionSignature): string {
  const spec = TYPE_SPECS[signature.returnType];
  const params: string[] = [];

  for (const param of signature.params) {
    const paramSpec = TYPE_SPECS[param.type];
    params.push(`${paramSpec.cType} ${param.name}`);
    for (const extra of paramSpec.extraParams?.(param.name) ?? []) {
      params.push(`${TYPE_SPECS[extra.type].cType} ${extra.name}`);
    }
  }

  // Array returns need somewhere to report their length, exactly as LeetCode does.
  if (isArrayReturn(signature.returnType)) {
    params.push('int* returnSize');
  }

  return `${spec.cType} ${signature.name}(${params.length ? params.join(', ') : 'void'})`;
}

function isArrayReturn(type: ValueType): boolean {
  return type.endsWith('[]');
}

/** The stub pre-loaded into the student's editor. */
export function generateStarterCode(signature: FunctionSignature): string {
  const body = isArrayReturn(signature.returnType)
    ? ['  // Set *returnSize to the number of elements you return.', '  ']
    : ['  '];
  return [`${renderSignature(signature)} {`, ...body, '}', ''].join('\n');
}

/** Shared stdin helpers injected into every generated driver. */
const DRIVER_PRELUDE = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int read_int(void) {
  int value;
  if (scanf("%d", &value) != 1) exit(2);
  return value;
}

static char* read_token(void) {
  char buffer[1 << 16];
  if (scanf("%65535s", buffer) != 1) return NULL;
  return strdup(buffer);
}

static char* read_line(void) {
  int c;
  /* Skip the newline left behind by a preceding scanf. */
  while ((c = getchar()) != EOF && (c == '\\n' || c == '\\r')) { }
  if (c == EOF) return strdup("");
  char* buffer = malloc(1 << 16);
  if (!buffer) exit(3);
  size_t length = 0;
  buffer[length++] = (char)c;
  while ((c = getchar()) != EOF && c != '\\n') {
    if (length + 1 < (1 << 16)) buffer[length++] = (char)c;
  }
  while (length > 0 && buffer[length - 1] == '\\r') length--;
  buffer[length] = '\\0';
  return buffer;
}`;

/**
 * Generates the driver `main()` for a signature.
 *
 * Input convention, which the question statement should state plainly:
 *   - scalars are read as one token, in parameter order
 *   - arrays are read as a length followed by that many elements
 *   - 2D arrays are read as rows, then cols, then rows*cols elements
 *   - `line` reads the remainder of a line, spaces included
 *
 * Output convention: scalars print on one line; arrays print their length on one
 * line followed by the elements.
 */
export function generateDriver(signature: FunctionSignature): string {
  if (!RETURNABLE.has(signature.returnType)) {
    throw new UnsupportedSignatureError(
      `The generator cannot print a '${signature.returnType}' return value.`,
    );
  }

  const body: string[] = [];
  const frees: string[] = [];

  for (const param of signature.params) {
    const spec = TYPE_SPECS[param.type];
    body.push(...spec.read(param.name).map((line) => `  ${line}`));
    for (const line of spec.free?.(param.name) ?? []) frees.push(`  ${line}`);
  }

  const args: string[] = [];
  for (const param of signature.params) {
    args.push(param.name);
    for (const extra of TYPE_SPECS[param.type].extraParams?.(param.name) ?? []) {
      args.push(extra.name);
    }
  }

  const returnSpec = TYPE_SPECS[signature.returnType];
  const arrayReturn = isArrayReturn(signature.returnType);
  if (arrayReturn) {
    body.push('  int resultSize = 0;');
    args.push('&resultSize');
  }

  body.push(`  ${returnSpec.cType} result = ${signature.name}(${args.join(', ')});`);
  body.push(...returnSpec.print('result').map((line) => `  ${line}`));
  body.push(...frees);
  body.push('  return 0;');

  return [DRIVER_PRELUDE, '', 'int main(void) {', ...body, '}', ''].join('\n');
}
