#!/bin/sh
# v13.6 önhesap zinciri (§6 ölçüm zinciri ve belirsizlik: T0.1 sub-piksel taraması ve S-eğrisi, T0.2 beklenen zincir tabanı ve DUT payı, T3.3 ölçüme dayalı çapraz denetim, U-05 zincire özgü, IMU grup gecikmesi, Welch örtüşmesi; V&V W7, M8, M9): bütün sonuçlar yeniden.
# İki kulvar: A (pre.json: denizaltı testleri, işletme, oynatma, gemi; ek koşu) ve B (tohum tekrarları 1–4); sonra birleştirme + V&V.
cd "$(dirname "$0")"
rm -f probe/pre136_*.flag 2>/dev/null
( node vv_seeds.js 1 > probe/pre136_seed1.log 2>&1 && node vv_seeds.js 2 > probe/pre136_seed2.log 2>&1 && \
  node vv_seeds.js 3 > probe/pre136_seed3.log 2>&1 && node vv_seeds.js 4 > probe/pre136_seed4.log 2>&1 && \
  echo ok > probe/pre136_seeds.flag ) &
node precompute.js tests > probe/pre136_sub_tests.log 2>&1 && \
node precompute.js op > probe/pre136_sub_op.log 2>&1 && \
node precompute.js play > probe/pre136_sub_play.log 2>&1 && \
node precompute.js all ship > probe/pre136_ship.log 2>&1 && \
node extra.js > probe/pre136_extra.log 2>&1 && \
echo ok > probe/pre136_a.flag
while [ ! -f probe/pre136_seeds.flag ]; do sleep 20; done
node vv_seeds_agg.js > probe/pre136_agg.log 2>&1 && \
node vv.js > probe/pre136_vv.log 2>&1 && \
node precompute.js vv > probe/pre136_vvmerge.log 2>&1 && \
echo PRE136_DONE > probe/pre136_done.flag
