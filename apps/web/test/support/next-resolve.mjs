// Next ships `next/server` without an exports map, so plain Node ESM cannot resolve the bare
// specifier the app (and Next's bundler) uses. Tests only: map it to the file that exists.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier === 'next/server' ? 'next/server.js' : specifier, context);
  },
});
