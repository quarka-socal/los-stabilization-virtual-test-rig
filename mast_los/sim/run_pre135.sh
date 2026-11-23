#!/bin/sh
# v13.5 önhesap zinciri (§5 kullanıcı kararları: vinyetleme kuralı, deniz ötelemesinin kolimatöre sığdırılması, T2.5 2–3 Hz, gemi D_c 200 mm, paralaks δ, taban düzeltmesi kapalı, öteleme dinamiği fbw; V&V M7, W11, K7): bütün sonuçlar yeniden.
# İki kulvar: A (pre.json: denizaltı testleri, işletme, oynatma, gemi; ek koşu) ve B (tohum tekrarları 1–4); sonra birleştirme + V&V.
cd "$(dirname "$0")"
rm -f probe/pre135_*.flag 2>/dev/null
( node vv_seeds.js 1 > probe/pre135_seed1.log 2>&1 && node vv_seeds.js 2 > probe/pre135_seed2.log 2>&1 && \
  node vv_seeds.js 3 > probe/pre135_seed3.log 2>&1 && node vv_seeds.js 4 > probe/pre135_seed4.log 2>&1 && \
  echo ok > probe/pre135_seeds.flag ) &
node precompute.js tests > probe/pre135_sub_tests.log 2>&1 && \
node precompute.js op > probe/pre135_sub_op.log 2>&1 && \
node precompute.js play > probe/pre135_sub_play.log 2>&1 && \
node precompute.js all ship > probe/pre135_ship.log 2>&1 && \
node extra.js > probe/pre135_extra.log 2>&1 && \
echo ok > probe/pre135_a.flag
while [ ! -f probe/pre135_seeds.flag ]; do sleep 20; done
node vv_seeds_agg.js > probe/pre135_agg.log 2>&1 && \
node vv.js > probe/pre135_vv.log 2>&1 && \
node precompute.js vv > probe/pre135_vvmerge.log 2>&1 && \
echo PRE135_DONE > probe/pre135_done.flag
