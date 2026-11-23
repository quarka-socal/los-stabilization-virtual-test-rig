#!/bin/sh
# v13.4 önhesap zinciri (§5 hexapod ve kolimatör: kolimatör geometrisi, göz bebeği kayması satırları ve oynatma dizileri; L_off varsayılanı 0; V&V W11): bütün sonuçlar yeniden.
# İki kulvar: A (pre.json: denizaltı testleri, işletme, oynatma, gemi; ek koşu) ve B (tohum tekrarları 1–4); sonra birleştirme + V&V.
cd "$(dirname "$0")"
rm -f probe/pre134_*.flag 2>/dev/null
( node vv_seeds.js 1 > probe/pre134_seed1.log 2>&1 && node vv_seeds.js 2 > probe/pre134_seed2.log 2>&1 && \
  node vv_seeds.js 3 > probe/pre134_seed3.log 2>&1 && node vv_seeds.js 4 > probe/pre134_seed4.log 2>&1 && \
  echo ok > probe/pre134_seeds.flag ) &
node precompute.js tests > probe/pre134_sub_tests.log 2>&1 && \
node precompute.js op > probe/pre134_sub_op.log 2>&1 && \
node precompute.js play > probe/pre134_sub_play.log 2>&1 && \
node precompute.js all ship > probe/pre134_ship.log 2>&1 && \
node extra.js > probe/pre134_extra.log 2>&1 && \
echo ok > probe/pre134_a.flag
while [ ! -f probe/pre134_seeds.flag ]; do sleep 20; done
node vv_seeds_agg.js > probe/pre134_agg.log 2>&1 && \
node vv.js > probe/pre134_vv.log 2>&1 && \
node precompute.js vv > probe/pre134_vvmerge.log 2>&1 && \
echo PRE134_DONE > probe/pre134_done.flag
