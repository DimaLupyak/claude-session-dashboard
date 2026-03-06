#!/bin/bash -eu
cd $SRC/claude-session-dashboard/apps/web
npx jazzer --instrument=src/lib/parsers -- -help=1 || true
cp src/lib/parsers/__tests__/fuzz.ts $OUT/fuzz_parser
