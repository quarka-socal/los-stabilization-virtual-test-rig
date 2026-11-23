#!/bin/sh
# v13.14 önhesap (§13 Düzenek): oynatma metrikleri değişti (hexapod tepeleri gerçekleşen harekettan, radyal P99, wander penceresi,
# darbe genlik ölçeği) — yalnız iki platformun oynatması + V&V (K7 yeni) + birleştirme. Testler, işletme ve tohumlar değişmez.
cd "$(dirname "$0")"
rm -f probe/pre1314_done.flag 2>/dev/null
node precompute.js play > probe/pre1314_sub_play.log 2>&1 && \
node precompute.js play ship > probe/pre1314_ship_play.log 2>&1 && \
node vv.js > probe/pre1314_vv.log 2>&1 && \
node precompute.js vv > probe/pre1314_vvmerge.log 2>&1 && \
echo PRE1314_DONE > probe/pre1314_done.flag
