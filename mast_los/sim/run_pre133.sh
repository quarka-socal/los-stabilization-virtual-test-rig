#!/bin/sh
# v13.3 önhesap zinciri (VIV kullanıcı kararları: denizaltı mast başı ötelemesi, kütle oranı, hız zarfı; deniz–ton strok paylaşımı): bütün sonuçlar yeniden.
# İki kulvar: A (pre.json: denizaltı testleri, işletme, oynatma, gemi; ek koşu) ve B (tohum tekrarları 1–4); sonra birleştirme + V&V.
cd "$(dirname "$0")"
rm -f probe/pre133_*.flag 2>/dev/null
( node vv_seeds.js 1 > probe/pre133_seed1.log 2>&1 && node vv_seeds.js 2 > probe/pre133_seed2.log 2>&1 && \
  node vv_seeds.js 3 > probe/pre133_seed3.log 2>&1 && node vv_seeds.js 4 > probe/pre133_seed4.log 2>&1 && \
  echo ok > probe/pre133_seeds.flag ) &
node precompute.js tests > probe/pre133_sub_tests.log 2>&1 && \
node precompute.js op > probe/pre133_sub_op.log 2>&1 && \
node precompute.js play > probe/pre133_sub_play.log 2>&1 && \
node precompute.js all ship > probe/pre133_ship.log 2>&1 && \
node extra.js > probe/pre133_extra.log 2>&1 && \
echo ok > probe/pre133_a.flag
while [ ! -f probe/pre133_seeds.flag ]; do sleep 20; done
node vv_seeds_agg.js > probe/pre133_agg.log 2>&1 && \
node vv.js > probe/pre133_vv.log 2>&1 && \
node precompute.js vv > probe/pre133_vvmerge.log 2>&1 && \
echo PRE133_DONE > probe/pre133_done.flag
