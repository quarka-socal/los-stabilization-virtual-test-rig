#!/bin/sh
# v13.1 önhesap zinciri (kaldıraç kolu vektörü, denizaltı h = 1 m, tam gövde hızlarıyla kol ivmesi): bütün sonuçlar yeniden.
# İki kulvar: A (pre.json: denizaltı testleri, işletme, oynatma, gemi; ek koşu) ve B (tohum tekrarları 1–4); sonra birleştirme + V&V.
cd "$(dirname "$0")"
rm -f probe/pre131_*.flag 2>/dev/null
( node vv_seeds.js 1 > probe/pre131_seed1.log 2>&1 && node vv_seeds.js 2 > probe/pre131_seed2.log 2>&1 && \
  node vv_seeds.js 3 > probe/pre131_seed3.log 2>&1 && node vv_seeds.js 4 > probe/pre131_seed4.log 2>&1 && \
  echo ok > probe/pre131_seeds.flag ) &
node precompute.js tests > probe/pre131_sub_tests.log 2>&1 && \
node precompute.js op > probe/pre131_sub_op.log 2>&1 && \
node precompute.js play > probe/pre131_sub_play.log 2>&1 && \
node precompute.js all ship > probe/pre131_ship.log 2>&1 && \
node extra.js > probe/pre131_extra.log 2>&1 && \
echo ok > probe/pre131_a.flag
while [ ! -f probe/pre131_seeds.flag ]; do sleep 20; done
node vv_seeds_agg.js > probe/pre131_agg.log 2>&1 && \
node vv.js > probe/pre131_vv.log 2>&1 && \
node precompute.js vv > probe/pre131_vvmerge.log 2>&1 && \
echo PRE131_DONE > probe/pre131_done.flag
