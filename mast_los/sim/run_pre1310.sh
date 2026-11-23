#!/bin/sh
# v13.10 önhesap zinciri (§9 kararları: dar bant kestirim hatası ve gözlemci model hatası parametreleri, varsayılanları v13.9 davranışı;
# §10 mekanik ve sürtünme: ek koşular σ0 ve direk modu; V&V D6). T0.7 tohum çalışması değişmediği için yeniden koşulmaz.
# İki kulvar: A (pre.json: denizaltı testleri, işletme, oynatma, gemi; ek koşu) ve B (tohum tekrarları 1–4).
cd "$(dirname "$0")"
rm -f probe/pre1310_a.flag probe/pre1310_seeds.flag probe/pre1310_done.flag 2>/dev/null
( node vv_seeds.js 1 > probe/pre1310_seed1.log 2>&1 && node vv_seeds.js 2 > probe/pre1310_seed2.log 2>&1 && \
  node vv_seeds.js 3 > probe/pre1310_seed3.log 2>&1 && node vv_seeds.js 4 > probe/pre1310_seed4.log 2>&1 && \
  echo ok > probe/pre1310_seeds.flag ) &
node precompute.js tests > probe/pre1310_sub_tests.log 2>&1 && \
node precompute.js op > probe/pre1310_sub_op.log 2>&1 && \
node precompute.js play > probe/pre1310_sub_play.log 2>&1 && \
node precompute.js all ship > probe/pre1310_ship.log 2>&1 && \
node extra.js > probe/pre1310_extra.log 2>&1 && \
echo ok > probe/pre1310_a.flag
while [ ! -f probe/pre1310_seeds.flag ] || [ ! -f probe/pre1310_a.flag ]; do sleep 20; done
node vv_seeds_agg.js > probe/pre1310_agg.log 2>&1 && \
node vv.js > probe/pre1310_vv.log 2>&1 && \
node precompute.js vv > probe/pre1310_vvmerge.log 2>&1 && \
echo PRE1310_DONE > probe/pre1310_done.flag
