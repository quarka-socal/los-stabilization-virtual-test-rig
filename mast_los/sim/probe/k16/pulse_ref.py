# v13.14 §13: yarım sinüs açı darbesinin hexapod dinamiğinden (2. derece, f_bw 20 Hz, ζ 0,7071) sonra gerçekleşen tepe ivmesi.
# Bağımsız: sürekli zaman durum uzayı, ince adım (RK4, 20 kHz); komut θ(t) = A·sin(πt/T_p), 0 ≤ t ≤ T_p.
# Çıktı: birim genlik başına tepe α (°/s² / °) ve α ≤ α_max için izinli genlik; şimdiki kural A = 0,9·min(θ_max, ω_max·T_p/π, α_max·(T_p/π)²).
import math, json, os
fbw, zeta = 20.0, 0.7071; w = 2 * math.pi * fbw; th_max, om_max, al_max = 15.0, 40.0, 400.0
def resp(Tp, A=1.0, dt=5e-5, Tend=None):
    Tend = Tend or Tp + 0.4; x, v = 0.0, 0.0; amax = 0.0; vmax = 0.0; xmax = 0.0
    u = lambda t: A * math.sin(math.pi * t / Tp) if 0 <= t <= Tp else 0.0
    f = lambda t, x, v: (v, w * w * (u(t) - x) - 2 * zeta * w * v)
    t = 0.0
    while t < Tend:
        k1 = f(t, x, v); k2 = f(t + dt / 2, x + dt / 2 * k1[0], v + dt / 2 * k1[1]); k3 = f(t + dt / 2, x + dt / 2 * k2[0], v + dt / 2 * k2[1]); k4 = f(t + dt, x + dt * k3[0], v + dt * k3[1])
        x += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); v += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); t += dt
        a = w * w * (u(t) - x) - 2 * zeta * w * v
        amax = max(amax, abs(a)); vmax = max(vmax, abs(v)); xmax = max(xmax, abs(x))
    return xmax, vmax, amax
out = []
for Tp in (0.05, 0.1, 0.2):
    A_now = 0.9 * min(th_max, om_max * Tp / math.pi, al_max * (Tp / math.pi) ** 2)
    x1, v1, a1 = resp(Tp)                       # birim genlik (1°)
    A_ok = 0.9 * min(th_max, om_max / v1, al_max / a1)
    out.append({'Tp': Tp, 'A_now': A_now, 'perA': {'th': x1, 'om': v1, 'al': a1}, 'al_now': a1 * A_now, 'A_ok': A_ok, 'ratio': A_ok / A_now})
    print(f"T_p {Tp*1e3:.0f} ms: şimdiki A {A_now:.4f}° → gerçekleşen θ {x1*A_now:.4f}°, ω {v1*A_now:.2f} °/s, α {a1*A_now:.1f} °/s² (sınır {al_max:.0f}); α ≤ 0,9·sınır için A {A_ok:.4f}° (× {A_ok/A_now:.3f})")
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pulse_ref.json'), 'w'), indent=1)
