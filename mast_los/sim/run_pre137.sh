#!/bin/sh
# v13.7 önhesap zinciri (§6 kullanıcı kararları: K2 karar belirsizliği ve koruma bandı, K4 gürültü yoğunluğu; §7 dünya dönüşü: T0.7 eşikleri
# bütçe drift bileşimiyle, KAPALI mutlak tolerans, ayrıştırma satırı, çıkış süresi kenar payıyla, en uzun stab kaydı recT; V&V W7, W12, M10):
# bütün sonuçlar + T0.7 tohum çalışması (100 tohum × 2 değişke) yeniden.
# İki kulvar: A (pre.json: denizaltı testleri, işletme, oynatma, gemi; ek koşu; T0.7 tohumları 0–49) ve B (tohum tekrarları 1–4; T0.7 50–99).
cd "$(dirname "$0")"
rm -f probe/pre137_a.flag probe/pre137_seeds.flag probe/pre137_done.flag 2>/dev/null
( node vv_seeds.js 1 > probe/pre137_seed1.log 2>&1 && node vv_seeds.js 2 > probe/pre137_seed2.log 2>&1 && \
  node vv_seeds.js 3 > probe/pre137_seed3.log 2>&1 && node vv_seeds.js 4 > probe/pre137_seed4.log 2>&1 && \
  node t07_study.js base 50 100 > probe/t07_base_b.log 2>&1 && node t07_study.js fresh 50 100 > probe/t07_fresh_b.log 2>&1 && \
  echo ok > probe/pre137_seeds.flag ) &
node precompute.js tests > probe/pre137_sub_tests.log 2>&1 && \
node precompute.js op > probe/pre137_sub_op.log 2>&1 && \
node precompute.js play > probe/pre137_sub_play.log 2>&1 && \
node precompute.js all ship > probe/pre137_ship.log 2>&1 && \
node extra.js > probe/pre137_extra.log 2>&1 && \
node t07_study.js base 0 50 > probe/t07_base_a.log 2>&1 && node t07_study.js fresh 0 50 > probe/t07_fresh_a.log 2>&1 && \
echo ok > probe/pre137_a.flag
while [ ! -f probe/pre137_seeds.flag ] || [ ! -f probe/pre137_a.flag ]; do sleep 20; done
cat probe/t07_base_a.log probe/t07_base_b.log > t07_base.log && cat probe/t07_fresh_a.log probe/t07_fresh_b.log > t07_fresh.log && \
node vv_seeds_agg.js > probe/pre137_agg.log 2>&1 && \
node t07_agg.js > probe/pre137_t07agg.log 2>&1 && \
node vv.js > probe/pre137_vv.log 2>&1 && \
node precompute.js vv > probe/pre137_vvmerge.log 2>&1 && \
echo PRE137_DONE > probe/pre137_done.flag
