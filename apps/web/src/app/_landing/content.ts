/**
 * Landing page copy, kept apart from layout. Facts come from the poster (via `_public/event.ts`) and the rules of
 * the contest (ADR-007, ADR-013, ADR-018); anything not confirmed by the client is listed in `_landing/README.md`.
 */
import coderDebug from './coder-debug.webp';
import coderWave from './coder-wave.webp';
import winner from './winner.webp';

export const STEPS = [
  {
    title: 'Direct',
    text: 'You never type code. You tell an AI junior developer what to build: the algorithm, the data structures, the types.',
    art: coderWave,
    alt: 'The hooded skeleton coder waving from behind his laptop',
  },
  {
    title: 'Debug',
    text: 'Sample runs are free. When a test fails, work out why and tell the junior exactly what to fix.',
    art: coderDebug,
    alt: 'The coder scratching his skull at a cracked laptop while a ghost shrugs',
  },
  {
    title: 'Win',
    text: 'Hidden tests decide what is correct, and a judge model reads how you got there. Fewest tokens, sharpest prompts.',
    art: winner,
    alt: 'A cloaked skeleton lifting a jack-o-lantern trophy between two cheering ghosts',
  },
] as const;

export const DAY = [
  { title: 'Check in', text: 'A volunteer scans your QR badge at the desk. That unlocks your account.', icon: 'scan' },
  { title: 'Lock in', text: 'Open CodeHaunt in Safe Exam Browser on your Windows laptop.', icon: 'lock' },
  { title: 'Haunt the problems', text: 'Direct the junior through as many problems as you can.', icon: 'code' },
  { title: 'Tech talk', text: 'The second half of the day: a talk from the stage.', icon: 'mic' },
  { title: 'Results', text: 'The leaderboard goes up on the big screen.', icon: 'trophy' },
] as const;

export const FAQ = [
  {
    q: 'What do I need to bring?',
    a: 'A Windows 10 or 11 laptop with Safe Exam Browser installed, and its charger. The organisers share the CodeHaunt config file before the day.',
  },
  {
    q: 'Can I use ChatGPT or my own tools?',
    a: 'No. The contest runs inside Safe Exam Browser, which shuts out other apps and sites. The only AI you talk to is the junior.',
  },
  {
    q: 'Which languages can the junior write?',
    a: 'Python 3, C, C++ and Java. You choose one per problem.',
  },
  {
    q: 'How is it scored?',
    a: 'Passing the hidden tests counts most. The tokens you spend, how fast and lean your solutions run, and how well you direct the junior count too.',
  },
  {
    q: 'How do I get in on the day?',
    a: 'Come to the desk with your registration. A volunteer scans your QR badge, and that unlocks your account. Seats are limited.',
  },
  {
    q: 'What is there to win?',
    a: 'A chance at double MAR points, and the right to haunt the leaderboard.',
  },
] as const;
