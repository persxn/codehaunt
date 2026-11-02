/** One table for the four languages: contract name ↔ DB enum, display name, code-fence tags (ADR-005). */
import type { Language } from '@codehaunt/contracts';

export type DbLanguage = 'C' | 'CPP' | 'JAVA' | 'PYTHON';

export const LANGUAGES: Readonly<Record<Language, { db: DbLanguage; label: string; fences: readonly string[] }>> = {
  c: { db: 'C', label: 'C', fences: ['c', 'h'] },
  cpp: { db: 'CPP', label: 'C++', fences: ['cpp', 'c++', 'cc', 'cxx', 'hpp'] },
  java: { db: 'JAVA', label: 'Java', fences: ['java'] },
  python: { db: 'PYTHON', label: 'Python 3', fences: ['python', 'py', 'python3'] },
};

export function toDbLanguage(language: Language): DbLanguage {
  return LANGUAGES[language].db;
}

export function fromDbLanguage(language: DbLanguage): Language {
  return (Object.keys(LANGUAGES) as Language[]).find((l) => LANGUAGES[l].db === language)!;
}
