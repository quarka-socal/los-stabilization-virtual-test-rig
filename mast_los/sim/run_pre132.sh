#!/bin/sh
# v13.2 önhesap zinciri (VIV: T2.1 bandı f_n dahil, T2.3 ton koşusu resF, erişim GEÇERSİZ kuralı, B2-01 DRR parametresi, gemi yol ayrımı): bütün sonuçlar yeniden.
# İki kulvar: A (pre.json: denizaltı testleri, işletme, oynatma, gemi; ek koşu) ve B (tohum tekrarları 1–4); sonra birleştirme + V&V.
cd "$(dirname "$0")"
rm -f probe/pre132_*.flag 2>/dev/null
( node vv_seeds.js 1 > probe/pre132_seed1.log 2>&1 && node vv_seeds.js 2 > probe/pre132_seed2.log 2>&1 && \
  node vv_seeds.js 3 > probe/pre132_seed3.log 2>&1 && node vv_seeds.js 4 > probe/pre132_seed4.log 2>&1 && \
  echo ok > probe/pre132_seeds.flag ) &
node precompute.js tests > probe/pre132_sub_tests.log 2>&1 && \
node precompute.js op > probe/pre132_sub_op.log 2>&1 && \
node precompute.js play > probe/pre132_sub_play.log 2>&1 && \
node precompute.js all ship > probe/pre132_ship.log 2>&1 && \
node extra.js > probe/pre132_extra.log 2>&1 && \
echo ok > probe/pre132_a.flag
while [ ! -f probe/pre132_seeds.flag ]; do sleep 20; done
node vv_seeds_agg.js > probe/pre132_agg.log 2>&1 && \
node vv.js > probe/pre132_vv.log 2>&1 && \
node precompute.js vv > probe/pre132_vvmerge.log 2>&1 && \
echo PRE132_DONE > probe/pre132_done.flag
