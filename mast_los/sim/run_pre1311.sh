#!/bin/sh
# v13.11 önhesap zinciri (§11 gyro, modlar, optik: T3.4 katlanma denetimi ve harmonik toplamı, T1.8 doyum metni; ek koşular T0.6 / T0.1 dağılımı,
# mod frekansı, g-duyarlılığı; V&V M4 dağılım ölçütü ve C3). T0.7 tohum çalışması değişmediği için yeniden koşulmaz.
# İki kulvar: A (pre.json: denizaltı testleri, işletme, oynatma, gemi; ek koşu) ve B (tohum tekrarları 1–4).
cd "$(dirname "$0")"
rm -f probe/pre1311_a.flag probe/pre1311_seeds.flag probe/pre1311_done.flag 2>/dev/null
( node vv_seeds.js 1 > probe/pre1311_seed1.log 2>&1 && node vv_seeds.js 2 > probe/pre1311_seed2.log 2>&1 && \
  node vv_seeds.js 3 > probe/pre1311_seed3.log 2>&1 && node vv_seeds.js 4 > probe/pre1311_seed4.log 2>&1 && \
  echo ok > probe/pre1311_seeds.flag ) &
node precompute.js tests > probe/pre1311_sub_tests.log 2>&1 && \
node precompute.js op > probe/pre1311_sub_op.log 2>&1 && \
node precompute.js play > probe/pre1311_sub_play.log 2>&1 && \
node precompute.js all ship > probe/pre1311_ship.log 2>&1 && \
node extra.js > probe/pre1311_extra.log 2>&1 && \
echo ok > probe/pre1311_a.flag
while [ ! -f probe/pre1311_seeds.flag ] || [ ! -f probe/pre1311_a.flag ]; do sleep 20; done
node vv_seeds_agg.js > probe/pre1311_agg.log 2>&1 && \
node vv.js > probe/pre1311_vv.log 2>&1 && \
node precompute.js vv > probe/pre1311_vvmerge.log 2>&1 && \
echo PRE1310_DONE > probe/pre1311_done.flag
