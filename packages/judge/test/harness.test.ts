import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MainNotAllowedError,
  assembleFunctionProgram,
  definesMain,
  generateDriver,
  generateStarterCode,
  renderSignature,
  type FunctionSignature,
} from '../src/harness.ts';
import { judge } from '../src/judge.ts';
import { backend, cases, skipReason } from './helpers.ts';

describe('main() detection', () => {
  test('rejects a real main definition', () => {
    assert.ok(definesMain('int main(void) { return 0; }'));
    assert.ok(definesMain('int\nmain ( int argc, char** argv ) { }'));
  });

  test('does not fire on comments or string literals', () => {
    assert.ok(!definesMain('// call this from main()\nint f(void) { return 1; }'));
    assert.ok(!definesMain('/* main() is provided */ int f(void) { return 1; }'));
    assert.ok(!definesMain('int f(void) { printf("main("); return 1; }'));
  });

  test('does not fire on a substring of another identifier', () => {
    assert.ok(!definesMain('int domain(void) { return 1; }'));
    assert.ok(!definesMain('int f(void) { return remain(3); }'));
  });

  test('assembly refuses a submission containing main', () => {
    assert.throws(
      () =>
        assembleFunctionProgram({
          header: '#include <stdio.h>',
          studentCode: 'int main(void) { return 0; }',
          driver: 'int main(void) { return 0; }',
        }),
      MainNotAllowedError,
    );
  });
});

describe('signature rendering', () => {
  test('array parameters gain a size argument, array returns gain returnSize', () => {
    const signature: FunctionSignature = {
      name: 'twoSum',
      returnType: 'int[]',
      params: [
        { name: 'nums', type: 'int[]' },
        { name: 'target', type: 'int' },
      ],
    };
    assert.equal(
      renderSignature(signature),
      'int* twoSum(int* nums, int numsSize, int target, int* returnSize)',
    );
  });

  test('a no-parameter function renders as (void)', () => {
    assert.equal(
      renderSignature({ name: 'answer', returnType: 'int', params: [] }),
      'int answer(void)',
    );
  });

  test('starter code is a compilable stub matching the signature', () => {
    const starter = generateStarterCode({
      name: 'add',
      returnType: 'int',
      params: [
        { name: 'a', type: 'int' },
        { name: 'b', type: 'int' },
      ],
    });
    assert.match(starter, /^int add\(int a, int b\) \{/);
  });
});

describe('generated drivers compile and run', () => {
  async function runFunctionProblem(
    signature: FunctionSignature,
    studentCode: string,
    pairs: [string, string][],
  ) {
    const program = assembleFunctionProgram({
      header: '#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>',
      studentCode,
      driver: generateDriver(signature),
    });
    return judge(backend!, { program, tests: cases(pairs) });
  }

  test('scalar parameters and return', { skip: skipReason }, async () => {
    const result = await runFunctionProblem(
      {
        name: 'add',
        returnType: 'int',
        params: [
          { name: 'a', type: 'int' },
          { name: 'b', type: 'int' },
        ],
      },
      'int add(int a, int b) { return a + b; }',
      [
        ['2 3\n', '5\n'],
        ['-1 1\n', '0\n'],
      ],
    );
    assert.equal(result.verdict, 'AC');
  });

  test('array parameter with generated size argument', { skip: skipReason }, async () => {
    const result = await runFunctionProblem(
      {
        name: 'sumArray',
        returnType: 'int',
        params: [{ name: 'nums', type: 'int[]' }],
      },
      `int sumArray(int* nums, int numsSize) {
  int total = 0;
  for (int i = 0; i < numsSize; i++) total += nums[i];
  return total;
}`,
      [
        ['4\n1 2 3 4\n', '10\n'],
        ['0\n', '0\n'],
      ],
    );
    assert.equal(result.verdict, 'AC');
  });

  test('array return with returnSize, LeetCode style', { skip: skipReason }, async () => {
    const result = await runFunctionProblem(
      {
        name: 'doubleAll',
        returnType: 'int[]',
        params: [{ name: 'nums', type: 'int[]' }],
      },
      `int* doubleAll(int* nums, int numsSize, int* returnSize) {
  int* out = malloc(sizeof(int) * (numsSize > 0 ? numsSize : 1));
  for (int i = 0; i < numsSize; i++) out[i] = nums[i] * 2;
  *returnSize = numsSize;
  return out;
}`,
      [['3\n1 2 3\n', '3\n2 4 6\n']],
    );
    assert.equal(result.verdict, 'AC');
  });

  test('string parameter and return', { skip: skipReason }, async () => {
    const result = await runFunctionProblem(
      {
        name: 'shout',
        returnType: 'string',
        params: [{ name: 'word', type: 'string' }],
      },
      `char* shout(char* word) {
  for (char* p = word; *p; p++) {
    if (*p >= 'a' && *p <= 'z') *p = *p - 'a' + 'A';
  }
  return word;
}`,
      [['hello\n', 'HELLO\n']],
    );
    assert.equal(result.verdict, 'AC');
  });

  test('a wrong function body still produces WA, not a crash', { skip: skipReason }, async () => {
    const result = await runFunctionProblem(
      {
        name: 'add',
        returnType: 'int',
        params: [
          { name: 'a', type: 'int' },
          { name: 'b', type: 'int' },
        ],
      },
      'int add(int a, int b) { return a - b; }',
      [['2 3\n', '5\n']],
    );
    assert.equal(result.verdict, 'WA');
  });
});

describe('compile error line mapping', () => {
  test('reports the student line number, not the assembled one', { skip: skipReason }, async () => {
    // The missing semicolon is on line 2 of what the student typed. The
    // assembled file puts it much further down; the student must still see 2.
    const studentCode = `int add(int a, int b) {
  int sum = a + b
  return sum;
}`;
    const program = assembleFunctionProgram({
      header: '#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>',
      studentCode,
      driver: generateDriver({
        name: 'add',
        returnType: 'int',
        params: [
          { name: 'a', type: 'int' },
          { name: 'b', type: 'int' },
        ],
      }),
    });

    const result = await judge(backend!, { program, tests: cases([['1 2\n', '3\n']]) });

    assert.equal(result.verdict, 'CE');
    assert.match(result.compileLog, /solution\.c:2/);
    assert.doesNotMatch(result.compileLog, /driver\.c/, 'harness internals stay hidden');
    assert.doesNotMatch(result.compileLog, /harness\.c/);
    assert.doesNotMatch(result.compileLog, /\/tmp\//, 'no judge paths leak to students');
  });
});
