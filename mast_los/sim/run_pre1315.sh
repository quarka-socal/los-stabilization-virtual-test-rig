#!/bin/sh
# v13.15 önhesap (§14): losSummary Gauss beklentisini (Rice) taşır — T1.9 (num, iki platform) ve işletme ayrıştırmasının gereksinim
# özetleri (op.req) yeniden; T1.9'un PPV notu. T0.1 bağlam için birlikte. Durum ve sayılar değişmez.
cd "$(dirname "$0")"
rm -f probe/pre1315_done.flag 2>/dev/null
node precompute.js tests T0.1,T1.9 > probe/pre1315_sub_tests.log 2>&1 && \
node precompute.js op > probe/pre1315_sub_op.log 2>&1 && \
node precompute.js tests T0.1,T1.9 ship > probe/pre1315_ship_tests.log 2>&1 && \
node precompute.js op ship > probe/pre1315_ship_op.log 2>&1 && \
echo PRE1315_DONE > probe/pre1315_done.flag
