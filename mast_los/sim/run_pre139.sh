#!/bin/sh
# v13.9 önhesap zinciri (§8 kararları: K2(b) rastgele yürüyüş satırları wander penceresinde — T0.6 dolgusu ve işletme B1-05 karşılaştırması
# değişir; §9 stabilizasyon döngüsü: kazanç payı ikiye bölmeyle, V&V W14). T0.7 tohum çalışması değişmediği için yeniden koşulmaz.
# İki kulvar: A (pre.json: denizaltı testleri, işletme, oynatma, gemi; ek koşu) ve B (tohum tekrarları 1–4).
cd "$(dirname "$0")"
rm -f probe/pre139_a.flag probe/pre139_seeds.flag probe/pre139_done.flag 2>/dev/null
( node vv_seeds.js 1 > probe/pre139_seed1.log 2>&1 && node vv_seeds.js 2 > probe/pre139_seed2.log 2>&1 && \
  node vv_seeds.js 3 > probe/pre139_seed3.log 2>&1 && node vv_seeds.js 4 > probe/pre139_seed4.log 2>&1 && \
  echo ok > probe/pre139_seeds.flag ) &
node precompute.js tests > probe/pre139_sub_tests.log 2>&1 && \
node precompute.js op > probe/pre139_sub_op.log 2>&1 && \
node precompute.js play > probe/pre139_sub_play.log 2>&1 && \
node precompute.js all ship > probe/pre139_ship.log 2>&1 && \
node extra.js > probe/pre139_extra.log 2>&1 && \
echo ok > probe/pre139_a.flag
while [ ! -f probe/pre139_seeds.flag ] || [ ! -f probe/pre139_a.flag ]; do sleep 20; done
node vv_seeds_agg.js > probe/pre139_agg.log 2>&1 && \
node vv.js > probe/pre139_vv.log 2>&1 && \
node precompute.js vv > probe/pre139_vvmerge.log 2>&1 && \
echo PRE139_DONE > probe/pre139_done.flag
