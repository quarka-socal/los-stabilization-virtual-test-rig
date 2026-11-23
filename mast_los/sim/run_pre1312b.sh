#!/bin/sh
# v13.12 önhesap ek koşusu: kısmi koşuda T0.1 bağlamı (ölçek belirsizliği, piksel fazı) ve T0.2 tabanı kayıtlı bağlama yazılmıyordu →
# T1.9 kısmi koşuda model değerlerine düşmüştü. Bağlam artık T01 ve floor'u da taşır; T0.1, T0.2 ile birlikte T1.7 ve T1.9 yeniden.
cd "$(dirname "$0")"
rm -f probe/pre1312b_done.flag 2>/dev/null
node precompute.js tests T0.1,T0.2,T1.7,T1.9 > probe/pre1312b_sub_tests.log 2>&1 && \
node precompute.js tests T0.1,T0.2,T1.7,T1.9 ship > probe/pre1312b_ship_tests.log 2>&1 && \
echo PRE1312B_DONE > probe/pre1312b_done.flag
