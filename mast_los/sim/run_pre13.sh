#!/bin/sh
# v13 önhesap zinciri: testler (denizaltı, gemi) + V&V + V&V'nin pre.json'a aktarımı (işletme ayrıştırması ve oynatma değişmedi)
cd "$(dirname "$0")"
node precompute.js tests > probe/pre13_sub_tests.log 2>&1 && \
node precompute.js tests ship > probe/pre13_ship_tests.log 2>&1 && \
node vv.js > probe/pre13_vv.log 2>&1 && \
node precompute.js vv > probe/pre13_vvmerge.log 2>&1 && \
echo PRE13_DONE > probe/pre13_done.flag
